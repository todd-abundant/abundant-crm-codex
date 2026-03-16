import { NextResponse } from "next/server";
import { requireAdminApi, resolvePublicOrigin } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import {
  isGoogleWorkspaceMailerConfigured,
  sendGoogleWorkspaceEmail
} from "@/lib/google-workspace-mailer";
import { weeklyStakeholderDigestDispatchRequestSchema } from "@/lib/schemas";
import {
  buildWeeklyStakeholderDigestEmail,
  buildWeeklyStakeholderDigestSummary,
  previousWeeklyDigestWindow,
  runWeeklyStakeholderSignalSweeps
} from "@/lib/stakeholder-signals-weekly-digest";

function hasValidCronSecret(request: Request) {
  const expected = process.env.STAKEHOLDER_SIGNALS_CRON_SECRET?.trim();
  const provided = request.headers.get("x-stakeholder-signals-cron-secret")?.trim();
  return Boolean(expected && provided && expected === provided);
}

async function authorizeWeeklyDigestRequest(request: Request) {
  if (hasValidCronSecret(request)) {
    return { ok: true as const, mode: "cron" as const };
  }

  const auth = await requireAdminApi();
  if (!auth.ok) return auth;
  return { ok: true as const, mode: "admin" as const, user: auth.user };
}

function serializeSummary(summary: Awaited<ReturnType<typeof buildWeeklyStakeholderDigestSummary>>) {
  return JSON.parse(JSON.stringify(summary));
}

export async function POST(request: Request) {
  const auth = await authorizeWeeklyDigestRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const input = weeklyStakeholderDigestDispatchRequestSchema.parse(body);
    const window = previousWeeklyDigestWindow(new Date(), "America/Denver");
    const homeUrl = new URL("/", resolvePublicOrigin(request)).toString();

    const existingDispatch = input.dryRun
      ? null
      : await prisma.stakeholderSignalsDigestDispatch.findUnique({
          where: { digestKey: window.digestKey }
        });

    if (existingDispatch?.status === "SENT" && !input.force) {
      return NextResponse.json({
        result: {
          ok: true,
          skipped: true,
          reason: `Weekly digest ${window.digestKey} has already been sent.`,
          digestKey: window.digestKey,
          periodLabel: window.periodLabel,
          subscriberCount: existingDispatch.subscriberCount,
          sentCount: existingDispatch.sentCount,
          sentAt: existingDispatch.sentAt
        }
      });
    }

    const sweepSummary = input.runSweeps
      ? await runWeeklyStakeholderSignalSweeps({
          maxEntitiesPerKind: input.maxEntitiesPerKind,
          maxSignalsPerEntity: input.maxSignalsPerEntity,
          lookbackDays: input.lookbackDays
        })
      : null;

    const summary = await buildWeeklyStakeholderDigestSummary({
      weekStart: window.weekStart,
      weekEndExclusive: window.weekEndExclusive,
      digestKey: window.digestKey,
      periodLabel: window.periodLabel,
      homeUrl,
      topItemsPerKind: input.topItemsPerKind,
      timeZone: window.timeZone
    });
    const email = buildWeeklyStakeholderDigestEmail(summary);
    const subscribers = await prisma.user.findMany({
      where: {
        isActive: true,
        stakeholderDigestSubscribed: true
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    if (input.dryRun) {
      return NextResponse.json({
        result: {
          ok: true,
          dryRun: true,
          digestKey: window.digestKey,
          periodLabel: window.periodLabel,
          weekStart: window.weekStart,
          weekEndExclusive: window.weekEndExclusive,
          subscriberCount: subscribers.length,
          mailerConfigured: isGoogleWorkspaceMailerConfigured(),
          sweepSummary,
          summary,
          emailPreview: email
        }
      });
    }

    if (subscribers.length === 0) {
      await prisma.stakeholderSignalsDigestDispatch.upsert({
        where: { digestKey: window.digestKey },
        create: {
          digestKey: window.digestKey,
          weekStart: window.weekStart,
          weekEnd: window.weekEndExclusive,
          status: "SKIPPED",
          topItemsPerKind: input.topItemsPerKind,
          subscriberCount: 0,
          sentCount: 0,
          homeUrl,
          summaryJson: serializeSummary(summary),
          error: "No subscribed users"
        },
        update: {
          status: "SKIPPED",
          topItemsPerKind: input.topItemsPerKind,
          subscriberCount: 0,
          sentCount: 0,
          homeUrl,
          summaryJson: serializeSummary(summary),
          error: "No subscribed users"
        }
      });

      return NextResponse.json({
        result: {
          ok: true,
          skipped: true,
          reason: "No subscribed users.",
          digestKey: window.digestKey,
          periodLabel: window.periodLabel,
          sweepSummary,
          summary
        }
      });
    }

    if (!isGoogleWorkspaceMailerConfigured()) {
      return NextResponse.json(
        {
          error:
            "Weekly digest mailer is not configured. Set GOOGLE_WORKSPACE_IMPERSONATED_USER_EMAIL and a Google service-account JSON secret with Gmail send access."
        },
        { status: 400 }
      );
    }

    await prisma.stakeholderSignalsDigestDispatch.upsert({
      where: { digestKey: window.digestKey },
      create: {
        digestKey: window.digestKey,
        weekStart: window.weekStart,
        weekEnd: window.weekEndExclusive,
        status: "PENDING",
        topItemsPerKind: input.topItemsPerKind,
        subscriberCount: subscribers.length,
        sentCount: 0,
        homeUrl,
        summaryJson: serializeSummary(summary),
        error: null
      },
      update: {
        status: "PENDING",
        topItemsPerKind: input.topItemsPerKind,
        subscriberCount: subscribers.length,
        sentCount: 0,
        homeUrl,
        summaryJson: serializeSummary(summary),
        error: null,
        sentAt: null
      }
    });

    let sentCount = 0;
    const failures: Array<{ email: string; error: string }> = [];

    for (const subscriber of subscribers) {
      try {
        await sendGoogleWorkspaceEmail({
          toEmail: subscriber.email,
          toName: subscriber.name,
          subject: email.subject,
          html: email.html,
          text: email.text
        });
        sentCount += 1;
      } catch (error) {
        failures.push({
          email: subscriber.email,
          error: error instanceof Error ? error.message : "Unknown email send error"
        });
        console.error("weekly_stakeholder_digest_email_error", {
          email: subscriber.email,
          error
        });
      }
    }

    await prisma.stakeholderSignalsDigestDispatch.update({
      where: { digestKey: window.digestKey },
      data: {
        status: sentCount > 0 ? "SENT" : "FAILED",
        sentCount,
        subscriberCount: subscribers.length,
        sentAt: sentCount > 0 ? new Date() : null,
        error: failures.length > 0 ? failures.map((entry) => `${entry.email}: ${entry.error}`).join(" | ") : null,
        summaryJson: serializeSummary(summary)
      }
    });

    return NextResponse.json({
      result: {
        ok: sentCount > 0,
        digestKey: window.digestKey,
        periodLabel: window.periodLabel,
        subscriberCount: subscribers.length,
        sentCount,
        failedCount: failures.length,
        failures,
        sweepSummary,
        summary
      }
    });
  } catch (error) {
    console.error("weekly_stakeholder_digest_dispatch_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to dispatch weekly stakeholder digest." },
      { status: 400 }
    );
  }
}
