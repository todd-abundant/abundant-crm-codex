import { runCoInvestorSignalsSweep } from "@/lib/co-investor-signals";
import { runCompanySignalsSweep } from "@/lib/company-signals";
import { runContactSignalsSweep } from "@/lib/contact-signals";
import { prisma } from "@/lib/db";
import { runHealthSystemSignalsSweep } from "@/lib/health-system-signals";
import { stakeholderSignalsConfig, type DigestKind } from "@/lib/stakeholder-signals-config";

type AllianceDigestStatus = "YES" | "PROSPECT" | "NO";

type WeeklyDigestItem = {
  subjectName: string;
  eventType: string;
  headline: string;
  summary: string;
  suggestedOutreach: string | null;
  sourceUrl: string;
  sourceDomain: string | null;
  occurredAt: Date;
  allianceLabel?: string | null;
};

export type WeeklyDigestSection = {
  kind: DigestKind;
  label: string;
  items: WeeklyDigestItem[];
};

export type WeeklyDigestSummary = {
  digestKey: string;
  timeZone: string;
  weekStart: Date;
  weekEndExclusive: Date;
  periodLabel: string;
  homeUrl: string;
  sections: WeeklyDigestSection[];
};

export type WeeklyDigestSweepSummary = {
  "co-investors": Awaited<ReturnType<typeof runCoInvestorSignalsSweep>>;
  contacts: Awaited<ReturnType<typeof runContactSignalsSweep>>;
  companies: Awaited<ReturnType<typeof runCompanySignalsSweep>>;
  "health-systems": Awaited<ReturnType<typeof runHealthSystemSignalsSweep>>;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6
};

function zonedParts(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || "";

  return {
    year: Number.parseInt(read("year"), 10),
    month: Number.parseInt(read("month"), 10),
    day: Number.parseInt(read("day"), 10),
    hour: Number.parseInt(read("hour"), 10),
    minute: Number.parseInt(read("minute"), 10),
    second: Number.parseInt(read("second"), 10),
    weekday: read("weekday")
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(input: Omit<LocalDateParts, "weekday">, timeZone: string) {
  const guess = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second));
  const offset = timeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

function formatLocalIsoDate(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatPeriodLabel(start: Date, endExclusive: Date, timeZone: string) {
  const endInclusive = new Date(endExclusive.getTime() - 1);
  const startLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric"
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(endInclusive);
  return `${startLabel} - ${endLabel}`;
}

export function previousWeeklyDigestWindow(now = new Date(), timeZone = "America/Denver") {
  const nowParts = zonedParts(now, timeZone);
  const todayLocal = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day));
  const daysSinceMonday = WEEKDAY_INDEX[nowParts.weekday] ?? 0;

  const currentWeekStartLocal = new Date(todayLocal);
  currentWeekStartLocal.setUTCDate(currentWeekStartLocal.getUTCDate() - daysSinceMonday);

  const previousWeekStartLocal = new Date(currentWeekStartLocal);
  previousWeekStartLocal.setUTCDate(previousWeekStartLocal.getUTCDate() - 7);

  const weekStart = zonedDateTimeToUtc(
    {
      year: previousWeekStartLocal.getUTCFullYear(),
      month: previousWeekStartLocal.getUTCMonth() + 1,
      day: previousWeekStartLocal.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0
    },
    timeZone
  );

  const weekEndExclusive = zonedDateTimeToUtc(
    {
      year: currentWeekStartLocal.getUTCFullYear(),
      month: currentWeekStartLocal.getUTCMonth() + 1,
      day: currentWeekStartLocal.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0
    },
    timeZone
  );

  return {
    weekStart,
    weekEndExclusive,
    digestKey: `${formatLocalIsoDate(weekStart, timeZone)}_${formatLocalIsoDate(
      new Date(weekEndExclusive.getTime() - 1),
      timeZone
    )}`,
    periodLabel: formatPeriodLabel(weekStart, weekEndExclusive, timeZone),
    timeZone
  };
}

function signalTimestamp(input: {
  sourcePublishedAt: Date | null;
  signalDate: Date | null;
  createdAt: Date;
}) {
  return input.sourcePublishedAt || input.signalDate || input.createdAt;
}

function windowWhere(start: Date, endExclusive: Date) {
  return {
    OR: [
      {
        sourcePublishedAt: {
          gte: start,
          lt: endExclusive
        }
      },
      {
        sourcePublishedAt: null,
        createdAt: {
          gte: start,
          lt: endExclusive
        }
      }
    ]
  };
}

function alliancePriorityRank(status: AllianceDigestStatus | null | undefined) {
  if (status === "YES") return 0;
  if (status === "PROSPECT") return 1;
  return 2;
}

function allianceLabel(status: AllianceDigestStatus | null | undefined) {
  if (status === "YES") return "Alliance Member";
  if (status === "PROSPECT") return "Alliance Prospect";
  return null;
}

function highestAllianceStatus(statuses: AllianceDigestStatus[]) {
  if (statuses.includes("YES")) return "YES" as const;
  if (statuses.includes("PROSPECT")) return "PROSPECT" as const;
  return "NO" as const;
}

function sortWeeklyItems(items: WeeklyDigestItem[]) {
  return [...items].sort((left, right) => {
    const priorityDelta = alliancePriorityRank(
      left.allianceLabel === "Alliance Member"
        ? "YES"
        : left.allianceLabel === "Alliance Prospect"
          ? "PROSPECT"
          : "NO"
    ) -
      alliancePriorityRank(
        right.allianceLabel === "Alliance Member"
          ? "YES"
          : right.allianceLabel === "Alliance Prospect"
            ? "PROSPECT"
            : "NO"
      );

    if (priorityDelta !== 0) return priorityDelta;
    return right.occurredAt.getTime() - left.occurredAt.getTime();
  });
}

async function loadCoInvestorSection(start: Date, endExclusive: Date, limit: number): Promise<WeeklyDigestSection> {
  const items = await prisma.coInvestorSignalEvent.findMany({
    where: windowWhere(start, endExclusive),
    include: {
      coInvestor: {
        select: { name: true }
      }
    },
    orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  return {
    kind: "co-investors",
    label: stakeholderSignalsConfig["co-investors"].label,
    items: items.map((item) => ({
      subjectName: item.coInvestor.name,
      eventType: item.eventType,
      headline: item.headline,
      summary: item.summary,
      suggestedOutreach: item.suggestedOutreach,
      sourceUrl: item.sourceUrl,
      sourceDomain: item.sourceDomain,
      occurredAt: signalTimestamp(item)
    }))
  };
}

async function loadCompanySection(start: Date, endExclusive: Date, limit: number): Promise<WeeklyDigestSection> {
  const items = await prisma.companySignalEvent.findMany({
    where: windowWhere(start, endExclusive),
    include: {
      company: {
        select: { name: true }
      }
    },
    orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  return {
    kind: "companies",
    label: stakeholderSignalsConfig.companies.label,
    items: items.map((item) => ({
      subjectName: item.company.name,
      eventType: item.eventType,
      headline: item.headline,
      summary: item.summary,
      suggestedOutreach: item.suggestedOutreach,
      sourceUrl: item.sourceUrl,
      sourceDomain: item.sourceDomain,
      occurredAt: signalTimestamp(item)
    }))
  };
}

async function loadHealthSystemSection(start: Date, endExclusive: Date, limit: number): Promise<WeeklyDigestSection> {
  const items = await prisma.healthSystemSignalEvent.findMany({
    where: windowWhere(start, endExclusive),
    include: {
      healthSystem: {
        select: {
          name: true,
          allianceMemberStatus: true
        }
      }
    },
    orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }]
  });

  return {
    kind: "health-systems",
    label: stakeholderSignalsConfig["health-systems"].label,
    items: sortWeeklyItems(
      items.map((item) => ({
        subjectName: item.healthSystem.name,
        eventType: item.eventType,
        headline: item.headline,
        summary: item.summary,
        suggestedOutreach: item.suggestedOutreach,
        sourceUrl: item.sourceUrl,
        sourceDomain: item.sourceDomain,
        occurredAt: signalTimestamp(item),
        allianceLabel: allianceLabel(item.healthSystem.allianceMemberStatus as AllianceDigestStatus)
      }))
    ).slice(0, limit)
  };
}

async function loadContactSection(start: Date, endExclusive: Date, limit: number): Promise<WeeklyDigestSection> {
  const items = await prisma.contactSignalEvent.findMany({
    where: windowWhere(start, endExclusive),
    include: {
      contact: {
        select: {
          name: true,
          healthSystemLinks: {
            select: {
              healthSystem: {
                select: {
                  allianceMemberStatus: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }]
  });

  return {
    kind: "contacts",
    label: stakeholderSignalsConfig.contacts.label,
    items: sortWeeklyItems(
      items.map((item) => {
        const priority = highestAllianceStatus(
          item.contact.healthSystemLinks.map((link) => link.healthSystem.allianceMemberStatus as AllianceDigestStatus)
        );

        return {
          subjectName: item.contact.name,
          eventType: item.eventType,
          headline: item.headline,
          summary: item.summary,
          suggestedOutreach: item.suggestedOutreach,
          sourceUrl: item.sourceUrl,
          sourceDomain: item.sourceDomain,
          occurredAt: signalTimestamp(item),
          allianceLabel: allianceLabel(priority)
        };
      })
    ).slice(0, limit)
  };
}

export async function buildWeeklyStakeholderDigestSummary(input: {
  weekStart: Date;
  weekEndExclusive: Date;
  digestKey: string;
  periodLabel: string;
  homeUrl: string;
  topItemsPerKind: number;
  timeZone?: string;
}) {
  const timeZone = input.timeZone || "America/Denver";
  const [coInvestors, contacts, companies, healthSystems] = await Promise.all([
    loadCoInvestorSection(input.weekStart, input.weekEndExclusive, input.topItemsPerKind),
    loadContactSection(input.weekStart, input.weekEndExclusive, input.topItemsPerKind),
    loadCompanySection(input.weekStart, input.weekEndExclusive, input.topItemsPerKind),
    loadHealthSystemSection(input.weekStart, input.weekEndExclusive, input.topItemsPerKind)
  ]);

  return {
    digestKey: input.digestKey,
    timeZone,
    weekStart: input.weekStart,
    weekEndExclusive: input.weekEndExclusive,
    periodLabel: input.periodLabel,
    homeUrl: input.homeUrl,
    sections: [coInvestors, contacts, companies, healthSystems]
  } satisfies WeeklyDigestSummary;
}

export async function runWeeklyStakeholderSignalSweeps(input: {
  maxEntitiesPerKind: number;
  maxSignalsPerEntity: number;
  lookbackDays: number;
}) {
  const maxEntitiesPerKind = Math.min(Math.max(input.maxEntitiesPerKind, 1), 100);
  const maxSignalsPerEntity = Math.min(Math.max(input.maxSignalsPerEntity, 1), 10);
  const lookbackDays = Math.min(Math.max(input.lookbackDays, 1), 14);

  const [coInvestors, contacts, companies, healthSystems] = await Promise.all([
    runCoInvestorSignalsSweep({
      maxCoInvestors: maxEntitiesPerKind,
      maxSignalsPerCoInvestor: maxSignalsPerEntity,
      lookbackDays
    }),
    runContactSignalsSweep({
      maxContacts: maxEntitiesPerKind,
      maxSignalsPerEntity,
      lookbackDays
    }),
    runCompanySignalsSweep({
      maxCompanies: maxEntitiesPerKind,
      maxSignalsPerEntity,
      lookbackDays
    }),
    runHealthSystemSignalsSweep({
      maxHealthSystems: maxEntitiesPerKind,
      maxSignalsPerEntity,
      lookbackDays
    })
  ]);

  return {
    "co-investors": coInvestors,
    contacts,
    companies,
    "health-systems": healthSystems
  } satisfies WeeklyDigestSweepSummary;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEmailDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric"
  }).format(date);
}

export function buildWeeklyStakeholderDigestEmail(summary: WeeklyDigestSummary) {
  const subject = `Abundant CRM Stakeholder Signals Digest | ${summary.periodLabel}`;

  const htmlSections = summary.sections
    .map((section) => {
      if (section.items.length === 0) {
        return `
          <section style="margin:0 0 28px;">
            <h2 style="margin:0 0 10px;font-size:18px;color:#133259;">${escapeHtml(section.label)}</h2>
            <p style="margin:0;color:#49647f;font-size:14px;">No notable signals saved for this category during this period.</p>
          </section>
        `;
      }

      const itemsHtml = section.items
        .map((item) => {
          const badge = item.allianceLabel
            ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#edf4fb;border:1px solid #bfd4ee;color:#1e40af;font-size:11px;font-weight:700;">${escapeHtml(item.allianceLabel)}</span>`
            : "";
          const outreach = item.suggestedOutreach
            ? `<p style="margin:8px 0 0;font-size:13px;color:#133259;"><strong>Suggested outreach:</strong> ${escapeHtml(item.suggestedOutreach)}</p>`
            : "";

          return `
            <li style="margin:0 0 14px;padding:14px 16px;border:1px solid #d4e1ef;border-radius:12px;background:#ffffff;">
              <div style="margin:0 0 6px;font-size:13px;color:#49647f;">${escapeHtml(formatEmailDate(item.occurredAt, summary.timeZone))} · ${escapeHtml(item.eventType)}</div>
              <p style="margin:0 0 6px;font-size:15px;color:#133259;"><strong>${escapeHtml(item.subjectName)}</strong>${badge}</p>
              <p style="margin:0 0 6px;font-size:15px;line-height:1.5;"><a href="${escapeHtml(item.sourceUrl)}" style="color:#0f4f9c;text-decoration:none;"><strong>${escapeHtml(item.headline)}</strong></a></p>
              <p style="margin:0;font-size:14px;line-height:1.55;color:#314a63;">${escapeHtml(item.summary)}</p>
              ${outreach}
            </li>
          `;
        })
        .join("");

      return `
        <section style="margin:0 0 28px;">
          <h2 style="margin:0 0 10px;font-size:18px;color:#133259;">${escapeHtml(section.label)}</h2>
          <ul style="list-style:none;padding:0;margin:0;">${itemsHtml}</ul>
        </section>
      `;
    })
    .join("");

  const html = `
    <div style="margin:0;padding:24px;background:#f4f8fc;font-family:Inter, Arial, sans-serif;color:#133259;">
      <div style="max-width:760px;margin:0 auto;background:#f4f8fc;">
        <div style="margin:0 0 20px;padding:24px;border-radius:16px;background:linear-gradient(135deg, #0f4f9c 0%, #12345f 100%);color:#ffffff;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.78;">Weekly stakeholder digest</p>
          <h1 style="margin:0 0 10px;font-size:28px;line-height:1.2;">${escapeHtml(summary.periodLabel)}</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.55;max-width:560px;">Top stakeholder signals from the prior week across co-investors, contacts, companies, and health systems.</p>
          <a href="${escapeHtml(summary.homeUrl)}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#ffffff;color:#12345f;font-weight:700;text-decoration:none;">Open Abundant CRM</a>
        </div>
        ${htmlSections}
        <div style="padding:18px 20px;border-radius:14px;background:#ffffff;border:1px solid #d4e1ef;">
          <p style="margin:0 0 8px;font-size:14px;color:#314a63;">This digest links back to the CRM home page for full follow-up workflows.</p>
          <p style="margin:0;"><a href="${escapeHtml(summary.homeUrl)}" style="color:#0f4f9c;text-decoration:none;font-weight:700;">Go to CRM home page</a></p>
        </div>
      </div>
    </div>
  `;

  const textSections = summary.sections
    .map((section) => {
      if (section.items.length === 0) {
        return `${section.label}\n- No notable signals saved for this category during this period.`;
      }

      const itemsText = section.items
        .map((item) => {
          const lines = [
            `- ${item.subjectName}${item.allianceLabel ? ` [${item.allianceLabel}]` : ""}`,
            `  ${formatEmailDate(item.occurredAt, summary.timeZone)} | ${item.eventType}`,
            `  ${item.headline}`,
            `  ${item.summary}`,
            item.suggestedOutreach ? `  Suggested outreach: ${item.suggestedOutreach}` : null,
            `  Source: ${item.sourceUrl}`
          ].filter(Boolean);
          return lines.join("\n");
        })
        .join("\n\n");

      return `${section.label}\n${itemsText}`;
    })
    .join("\n\n");

  const text = [
    `Abundant CRM Stakeholder Signals Digest`,
    summary.periodLabel,
    "",
    textSections,
    "",
    `CRM home: ${summary.homeUrl}`
  ].join("\n");

  return { subject, html, text };
}
