import { NextResponse } from "next/server";
import { AddonAuthError, authenticateAddonRequest } from "@/lib/gmail-addon/auth";
import {
  buildAddCompanyCard,
  buildAddContactCard,
  buildAddHealthSystemCard,
  buildAddOpportunityCard,
  buildAttachNoteCard,
  buildErrorCard,
  buildHomeCard,
  buildSuccessCard,
  pushCard,
  updateCard
} from "@/lib/gmail-addon/cards";
import { attachEmailAsNotes, createCompanyFromForm, createContactFromForm, createHealthSystemFromForm, createOpportunityFromForm, loadOpportunityFormOptions } from "@/lib/gmail-addon/actions";
import { buildFallbackMessageMetadata, fetchMessageMetadata } from "@/lib/gmail-addon/gmail";
import { findMatchesForMessage } from "@/lib/gmail-addon/match";
import {
  getEventParameters,
  resolveAddonAction,
  resolveMessageTokens,
  type GmailAddonEvent
} from "@/lib/gmail-addon/types";

function resolveEndpointUrl(request: Request) {
  const configured = process.env.GMAIL_ADDON_ENDPOINT_AUDIENCE?.trim();
  if (configured) return configured;

  const incoming = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}${incoming.pathname}`;
  }

  return `${incoming.origin}${incoming.pathname}`;
}

export async function POST(request: Request) {
  let event: GmailAddonEvent;

  try {
    event = (await request.json()) as GmailAddonEvent;
  } catch {
    return NextResponse.json({ error: "Invalid add-on request payload" }, { status: 400 });
  }

  try {
    const actor = await authenticateAddonRequest(request, event);
    const endpoint = resolveEndpointUrl(request);
    const parameters = getEventParameters(event);

    const tokenContext = resolveMessageTokens(event);
    const messageId = tokenContext.messageId || parameters.messageId || null;

    let message = buildFallbackMessageMetadata(messageId);
    try {
      message = await fetchMessageMetadata({
        messageId,
        userOAuthToken: tokenContext.userOAuthToken,
        gmailAccessToken: tokenContext.gmailAccessToken
      });
    } catch (error) {
      console.error("gmail_addon_message_fetch_error", {
        error,
        messageId,
        actorId: actor.id
      });
    }

    const matches = await findMatchesForMessage(message);
    const action = resolveAddonAction(event);

    if (action === "home") {
      return NextResponse.json(pushCard(buildHomeCard({ message, matches, endpoint })));
    }

    if (action === "refresh_home") {
      return NextResponse.json(updateCard(buildHomeCard({ message, matches, endpoint })));
    }

    if (action === "nav_attach_note") {
      return NextResponse.json(pushCard(buildAttachNoteCard({ endpoint, message, matches })));
    }

    if (action === "nav_add_contact") {
      return NextResponse.json(pushCard(buildAddContactCard({ endpoint, message, matches })));
    }

    if (action === "nav_add_company") {
      return NextResponse.json(pushCard(buildAddCompanyCard({ endpoint, message })));
    }

    if (action === "nav_add_health_system") {
      return NextResponse.json(pushCard(buildAddHealthSystemCard({ endpoint, message })));
    }

    if (action === "nav_add_opportunity") {
      const options = await loadOpportunityFormOptions(matches);
      return NextResponse.json(
        pushCard(
          buildAddOpportunityCard({
            endpoint,
            message,
            companyOptions: options.companyOptions,
            healthSystemOptions: options.healthSystemOptions
          })
        )
      );
    }

    if (action === "submit_attach_note") {
      const result = await attachEmailAsNotes({
        actor,
        event,
        message
      });

      const successCard = buildSuccessCard(
        "Email attached",
        `Created ${result.createdCount} note(s). Skipped ${result.duplicateCount} duplicate target(s).`,
        endpoint,
        message
      );

      return NextResponse.json(updateCard(successCard, `Saved ${result.createdCount} note(s)`));
    }

    if (action === "submit_add_contact") {
      const created = await createContactFromForm({ actor, event });
      const successCard = buildSuccessCard(
        "Contact saved",
        `${created.created ? "Created" : "Matched"} contact: ${created.contactName}`,
        endpoint,
        message
      );

      return NextResponse.json(updateCard(successCard, "Contact saved"));
    }

    if (action === "submit_add_company") {
      const created = await createCompanyFromForm(event);
      const successCard = buildSuccessCard(
        "Company saved",
        `Created company: ${created.name}`,
        endpoint,
        message
      );

      return NextResponse.json(updateCard(successCard, "Company saved"));
    }

    if (action === "submit_add_health_system") {
      const created = await createHealthSystemFromForm(event);
      const successCard = buildSuccessCard(
        "Health system saved",
        `Created health system: ${created.name}`,
        endpoint,
        message
      );

      return NextResponse.json(updateCard(successCard, "Health system saved"));
    }

    if (action === "submit_add_opportunity") {
      const created = await createOpportunityFromForm(event);
      const successCard = buildSuccessCard(
        "Health System Opportunity saved",
        `Created health system opportunity: ${created.title} (Company: ${created.company.name})`,
        endpoint,
        message
      );

      return NextResponse.json(updateCard(successCard, "Health System Opportunity saved"));
    }

    return NextResponse.json(
      updateCard(
        buildHomeCard({ message, matches, endpoint }),
        `Unknown action: ${action}. Returning to summary.`
      )
    );
  } catch (error) {
    if (error instanceof AddonAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("gmail_addon_execute_error", error);

    const message = error instanceof Error ? error.message : "Unexpected add-on error";
    return NextResponse.json(updateCard(buildErrorCard(message), "Action failed"));
  }
}
