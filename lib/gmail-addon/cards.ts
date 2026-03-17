import { defaultWebsiteFromMessage, inferMessageEntityDefaults } from "@/lib/gmail-addon/inference";
import {
  type MatchCandidate,
  type MatchResults,
  type NormalizedMessageMetadata,
  type OrganizationMatchKind
} from "@/lib/gmail-addon/types";

type CardWidget = Record<string, unknown>;

type CardSection = {
  header?: string;
  widgets: CardWidget[];
};

type AddonCard = {
  header: {
    title: string;
    subtitle?: string;
  };
  sections: CardSection[];
};

type AddonResponse = {
  action: {
    navigations: Array<{
      pushCard?: AddonCard;
      updateCard?: AddonCard;
    }>;
    notification?: {
      text: string;
    };
  };
};

type ButtonSpec = {
  text: string;
  endpoint: string;
  parameters: Record<string, string | null | undefined>;
};

function toActionParameters(parameters: Record<string, string | null | undefined>) {
  return Object.entries(parameters)
    .filter((entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string")
    .map(([key, value]) => ({ key, value }));
}

function buttonListWidget(buttons: ButtonSpec[]): CardWidget {
  return {
    buttonList: {
      buttons: buttons.map((button) => ({
        text: button.text,
        onClick: {
          action: {
            function: button.endpoint,
            parameters: toActionParameters(button.parameters)
          }
        }
      }))
    }
  };
}

function buttonWidget(
  text: string,
  endpoint: string,
  parameters: Record<string, string | null | undefined>
): CardWidget {
  return buttonListWidget([{ text, endpoint, parameters }]);
}

function dualButtonWidget(
  primaryText: string,
  primaryEndpoint: string,
  primaryParameters: Record<string, string | null | undefined>,
  secondaryText: string,
  secondaryEndpoint: string,
  secondaryParameters: Record<string, string | null | undefined>
): CardWidget {
  return buttonListWidget([
    { text: primaryText, endpoint: primaryEndpoint, parameters: primaryParameters },
    { text: secondaryText, endpoint: secondaryEndpoint, parameters: secondaryParameters }
  ]);
}

function textInputWidget(name: string, label: string, value?: string, multiline?: boolean): CardWidget {
  return {
    textInput: {
      name,
      label,
      ...(value ? { value } : {}),
      ...(multiline ? { multiline: true } : {})
    }
  };
}

function selectionWidget(
  name: string,
  label: string,
  type: "DROPDOWN" | "CHECK_BOX" | "RADIO_BUTTON",
  items: Array<{ text: string; value: string; selected?: boolean }>
): CardWidget {
  return {
    selectionInput: {
      name,
      label,
      type,
      items
    }
  };
}

function baseCard(title: string, subtitle: string | undefined, sections: CardSection[]): AddonCard {
  return {
    header: {
      title,
      ...(subtitle ? { subtitle } : {})
    },
    sections
  };
}

function suggestedWebsite(message: NormalizedMessageMetadata) {
  return defaultWebsiteFromMessage(message);
}

function confidenceLabel(confidence: MatchCandidate["confidence"]) {
  return `${confidence[0]?.toUpperCase() || ""}${confidence.slice(1)} confidence`;
}

function organizationKindLabel(kind: OrganizationMatchKind) {
  if (kind === "COMPANY") return "Company";
  if (kind === "HEALTH_SYSTEM") return "Health system";
  return "Co-investor";
}

function matchRowWidget(args: {
  label: string;
  candidate: MatchCandidate | null;
  emptyText: string;
  textPrefix?: string;
}) {
  if (!args.candidate) {
    return {
      decoratedText: {
        topLabel: args.label,
        text: args.emptyText,
        wrapText: true
      }
    };
  }

  return {
    decoratedText: {
      topLabel: `${args.label} · ${confidenceLabel(args.candidate.confidence)}`,
      text: args.textPrefix ? `${args.textPrefix}: ${args.candidate.label}` : args.candidate.label,
      bottomLabel: args.candidate.subtitle || undefined,
      wrapText: true
    }
  };
}

function homeSummaryText(matches: MatchResults) {
  if (matches.primaryContact && matches.primaryOrganization) {
    return `Attach Email as Note will preselect ${matches.primaryContact.label} and ${matches.primaryOrganization.label}.`;
  }

  if (matches.primaryContact) {
    return `Matched contact ${matches.primaryContact.label}. No likely employer record was found yet.`;
  }

  if (matches.primaryOrganization) {
    return `Matched likely employer ${matches.primaryOrganization.label}. Add the sender as a contact to link them.`;
  }

  return "No existing contact or organization was matched from this sender yet.";
}

function topCandidate(candidates: MatchCandidate[]) {
  const top = candidates[0] || null;
  if (!top || top.confidence === "low") return null;
  return top;
}

function chunkButtons(buttons: ButtonSpec[], size: number) {
  const chunks: ButtonSpec[][] = [];
  for (let index = 0; index < buttons.length; index += size) {
    chunks.push(buttons.slice(index, index + size));
  }
  return chunks;
}

export function pushCard(card: AddonCard, notification?: string): AddonResponse {
  return {
    action: {
      navigations: [{ pushCard: card }],
      ...(notification ? { notification: { text: notification } } : {})
    }
  };
}

export function updateCard(card: AddonCard, notification?: string): AddonResponse {
  return {
    action: {
      navigations: [{ updateCard: card }],
      ...(notification ? { notification: { text: notification } } : {})
    }
  };
}

export function buildErrorCard(message: string) {
  return baseCard("Abundant CRM", "Gmail assistant", [
    {
      header: "Request failed",
      widgets: [
        {
          textParagraph: {
            text: message
          }
        }
      ]
    }
  ]);
}

export function buildHomeCard(args: {
  endpoint: string;
  message: NormalizedMessageMetadata;
  matches: MatchResults;
}) {
  const { endpoint, message, matches } = args;
  const inference = inferMessageEntityDefaults(message);
  const metadataAvailable = Boolean(message.fromRaw || message.fromEmail || message.subject || message.dateRaw);
  const quickActions: ButtonSpec[] = [];

  if (matches.suggestedAttachTargets.length > 0) {
    quickActions.push({
      text: "Attach Email as Note",
      endpoint,
      parameters: {
        addonAction: "nav_attach_note",
        messageId: message.messageId,
        threadId: message.threadId
      }
    });
  }

  if (!matches.primaryContact) {
    quickActions.push({
      text: "Add Contact",
      endpoint,
      parameters: {
        addonAction: "nav_add_contact",
        messageId: message.messageId,
        threadId: message.threadId
      }
    });
  }

  if (!matches.primaryOrganization) {
    quickActions.push(
      {
        text: "Add Company",
        endpoint,
        parameters: {
          addonAction: "nav_add_company",
          messageId: message.messageId,
          threadId: message.threadId
        }
      },
      {
        text: "Add Health System",
        endpoint,
        parameters: {
          addonAction: "nav_add_health_system",
          messageId: message.messageId,
          threadId: message.threadId
        }
      },
      {
        text: "Add Co-Investor",
        endpoint,
        parameters: {
          addonAction: "nav_add_co_investor",
          messageId: message.messageId,
          threadId: message.threadId
        }
      }
    );
  }

  if (matches.companies.length > 0) {
    quickActions.push({
      text: "Add Opportunity",
      endpoint,
      parameters: {
        addonAction: "nav_add_opportunity",
        messageId: message.messageId,
        threadId: message.threadId
      }
    });
  }

  const actionWidgets = chunkButtons(quickActions, 2).map((buttons) => buttonListWidget(buttons));

  const sections: CardSection[] = [
    {
      header: "Current email",
      widgets: [
        {
          decoratedText: {
            topLabel: "From",
            text: message.fromName,
            bottomLabel: message.fromEmail || undefined,
            wrapText: true
          }
        },
        {
          decoratedText: {
            topLabel: "Subject",
            text: message.subject || "(No subject)",
            wrapText: true
          }
        },
        ...(message.dateRaw
          ? [
              {
                decoratedText: {
                  topLabel: "Date",
                  text: message.dateRaw,
                  wrapText: true
                }
              }
            ]
          : []),
        {
          decoratedText: {
            topLabel: "Message ID",
            text: message.messageId || "(Unavailable)",
            wrapText: true
          }
        },
        {
          textParagraph: {
            text: metadataAvailable
              ? "Sender and subject loaded from Gmail."
              : "Waiting for Gmail message metadata. If this stays blank, the add-on still does not have the Gmail metadata scope."
          }
        }
      ]
    },
    {
      header: "CRM status",
      widgets: [
        matchRowWidget({
          label: "Contact",
          candidate: matches.primaryContact,
          emptyText: "No likely contact match"
        }),
        matchRowWidget({
          label: "Company",
          candidate: topCandidate(matches.companies),
          emptyText: "No likely company match"
        }),
        matchRowWidget({
          label: "Health system",
          candidate: topCandidate(matches.healthSystems),
          emptyText: "No likely health system match"
        }),
        matchRowWidget({
          label: "Co-investor",
          candidate: topCandidate(matches.coInvestors),
          emptyText: "No likely co-investor match"
        }),
        ...(!matches.primaryOrganization && inference.organizationName
          ? [
              {
                decoratedText: {
                  topLabel: "Inferred organization",
                  text: inference.organizationName,
                  bottomLabel: inference.suggestedEntityKind
                    ? organizationKindLabel(inference.suggestedEntityKind)
                    : undefined,
                  wrapText: true
                }
              }
            ]
          : []),
        {
          textParagraph: {
            text: homeSummaryText(matches)
          }
        }
      ]
    }
  ];

  if (actionWidgets.length > 0) {
    sections.push({
      header: "Quick actions",
      widgets: actionWidgets
    });
  }

  return baseCard("Abundant CRM", "Gmail assistant", sections);
}

function targetItemsFromMatches(matches: MatchResults) {
  const selectedKeys = new Set(matches.suggestedAttachTargets.map((target) => `${target.kind}:${target.id}`));
  const items: Array<{ text: string; value: string; selected?: boolean }> = [];

  for (const contact of matches.contacts.slice(0, 4)) {
    const value = `CONTACT:${contact.id}`;
    items.push({ text: `Contact: ${contact.label}`, value, selected: selectedKeys.has(value) });
  }
  for (const company of matches.companies.slice(0, 4)) {
    const value = `COMPANY:${company.id}`;
    items.push({ text: `Company: ${company.label}`, value, selected: selectedKeys.has(value) });
  }
  for (const healthSystem of matches.healthSystems.slice(0, 4)) {
    const value = `HEALTH_SYSTEM:${healthSystem.id}`;
    items.push({ text: `Health system: ${healthSystem.label}`, value, selected: selectedKeys.has(value) });
  }
  for (const coInvestor of matches.coInvestors.slice(0, 4)) {
    const value = `CO_INVESTOR:${coInvestor.id}`;
    items.push({ text: `Co-investor: ${coInvestor.label}`, value, selected: selectedKeys.has(value) });
  }
  for (const opportunity of matches.opportunities.slice(0, 4)) {
    items.push({ text: `Health System Opportunity: ${opportunity.label}`, value: `OPPORTUNITY:${opportunity.id}` });
  }

  return items;
}

export function buildAttachNoteCard(args: {
  endpoint: string;
  message: NormalizedMessageMetadata;
  matches: MatchResults;
}) {
  const { endpoint, message, matches } = args;
  const targetItems = targetItemsFromMatches(matches);

  return baseCard("Attach Email", "Create CRM notes from this message", [
    {
      header: "Select targets",
      widgets: [
        {
          textParagraph: {
            text:
              targetItems.length > 0
                ? matches.suggestedAttachTargets.length > 0
                  ? "Matched contact and organization targets are preselected. Adjust them if needed, then save the note."
                  : "Select one or more records. The add-on stores the email metadata and optional analyst note."
                : "No suggested records found. Create the contact or organization first, then return to attach this message."
          }
        },
        ...(targetItems.length > 0
          ? [selectionWidget("attachTargets", "Attach targets", "CHECK_BOX", targetItems)]
          : []),
        textInputWidget("notePrefix", "Analyst note (optional)", "", true),
        dualButtonWidget(
          "Save Note",
          endpoint,
          { addonAction: "submit_attach_note", messageId: message.messageId, threadId: message.threadId },
          "Back",
          endpoint,
          { addonAction: "refresh_home", messageId: message.messageId, threadId: message.threadId }
        )
      ]
    }
  ]);
}

export function buildAddContactCard(args: {
  endpoint: string;
  message: NormalizedMessageMetadata;
  matches: MatchResults;
}) {
  const { endpoint, message, matches } = args;
  const inference = inferMessageEntityDefaults(message);
  const suggestedPrincipalValue = matches.primaryOrganization
    ? `${matches.primaryOrganization.kind}:${matches.primaryOrganization.id}`
    : "NONE";
  const principalItems: Array<{ text: string; value: string; selected?: boolean }> = [
    { text: "No principal entity", value: "NONE", selected: suggestedPrincipalValue === "NONE" }
  ];

  for (const company of matches.companies.slice(0, 5)) {
    principalItems.push({
      text: `Company: ${company.label}`,
      value: `COMPANY:${company.id}`,
      selected: suggestedPrincipalValue === `COMPANY:${company.id}`
    });
  }
  for (const healthSystem of matches.healthSystems.slice(0, 5)) {
    principalItems.push({
      text: `Health system: ${healthSystem.label}`,
      value: `HEALTH_SYSTEM:${healthSystem.id}`,
      selected: suggestedPrincipalValue === `HEALTH_SYSTEM:${healthSystem.id}`
    });
  }
  for (const coInvestor of matches.coInvestors.slice(0, 5)) {
    principalItems.push({
      text: `Co-investor: ${coInvestor.label}`,
      value: `CO_INVESTOR:${coInvestor.id}`,
      selected: suggestedPrincipalValue === `CO_INVESTOR:${coInvestor.id}`
    });
  }

  return baseCard("Add Contact", "Create or match contact from sender", [
    {
      header: "Contact details",
      widgets: [
        ...(matches.primaryOrganization
          ? [
              {
                textParagraph: {
                  text: `Suggested employer: ${organizationKindLabel(matches.primaryOrganization.kind)} ${matches.primaryOrganization.label}`
                }
              }
            ]
          : []),
        textInputWidget("contactName", "Name", message.fromName),
        textInputWidget("contactEmail", "Email", message.fromEmail),
        textInputWidget("contactTitle", "Title", inference.contactTitle || ""),
        selectionWidget("contactPrincipal", "Principal entity", "DROPDOWN", principalItems),
        dualButtonWidget(
          "Save Contact",
          endpoint,
          { addonAction: "submit_add_contact", messageId: message.messageId, threadId: message.threadId },
          "Back",
          endpoint,
          { addonAction: "refresh_home", messageId: message.messageId, threadId: message.threadId }
        )
      ]
    }
  ]);
}

export function buildAddCompanyCard(args: { endpoint: string; message: NormalizedMessageMetadata }) {
  const { endpoint, message } = args;
  const inference = inferMessageEntityDefaults(message);

  return baseCard("Add Company", "Create a company record", [
    {
      header: "Company details",
      widgets: [
        textInputWidget("companyName", "Company name", inference.organizationName || ""),
        textInputWidget("companyWebsite", "Website", suggestedWebsite(message)),
        textInputWidget("companyHeadquartersCity", "HQ city", ""),
        textInputWidget("companyHeadquartersState", "HQ state", ""),
        textInputWidget("companyHeadquartersCountry", "HQ country", ""),
        selectionWidget("companyType", "Company type", "DROPDOWN", [
          { text: "Startup", value: "STARTUP", selected: true },
          { text: "Spin-out", value: "SPIN_OUT" },
          { text: "De novo", value: "DENOVO" }
        ]),
        dualButtonWidget(
          "Save Company",
          endpoint,
          { addonAction: "submit_add_company", messageId: message.messageId, threadId: message.threadId },
          "Back",
          endpoint,
          { addonAction: "refresh_home", messageId: message.messageId, threadId: message.threadId }
        )
      ]
    }
  ]);
}

export function buildAddHealthSystemCard(args: { endpoint: string; message: NormalizedMessageMetadata }) {
  const { endpoint, message } = args;
  const inference = inferMessageEntityDefaults(message);

  return baseCard("Add Health System", "Create a health system record", [
    {
      header: "Health system details",
      widgets: [
        textInputWidget("healthSystemName", "Health system name", inference.organizationName || ""),
        textInputWidget("healthSystemWebsite", "Website", suggestedWebsite(message)),
        textInputWidget("healthSystemHeadquartersCity", "HQ city", ""),
        textInputWidget("healthSystemHeadquartersState", "HQ state", ""),
        textInputWidget("healthSystemHeadquartersCountry", "HQ country", ""),
        selectionWidget("healthSystemAllianceMember", "Alliance member", "DROPDOWN", [
          { text: "No", value: "false", selected: true },
          { text: "Yes", value: "true" }
        ]),
        dualButtonWidget(
          "Save Health System",
          endpoint,
          {
            addonAction: "submit_add_health_system",
            messageId: message.messageId,
            threadId: message.threadId
          },
          "Back",
          endpoint,
          { addonAction: "refresh_home", messageId: message.messageId, threadId: message.threadId }
        )
      ]
    }
  ]);
}

export function buildAddCoInvestorCard(args: { endpoint: string; message: NormalizedMessageMetadata }) {
  const { endpoint, message } = args;
  const inference = inferMessageEntityDefaults(message);

  return baseCard("Add Co-Investor", "Create a co-investor record", [
    {
      header: "Co-investor details",
      widgets: [
        textInputWidget("coInvestorName", "Co-investor name", inference.organizationName || ""),
        textInputWidget("coInvestorWebsite", "Website", suggestedWebsite(message)),
        textInputWidget("coInvestorHeadquartersCity", "HQ city", ""),
        textInputWidget("coInvestorHeadquartersState", "HQ state", ""),
        textInputWidget("coInvestorHeadquartersCountry", "HQ country", ""),
        selectionWidget("coInvestorIsSeedInvestor", "Seed investor", "DROPDOWN", [
          { text: "No", value: "false", selected: true },
          { text: "Yes", value: "true" }
        ]),
        selectionWidget("coInvestorIsSeriesAInvestor", "Series A investor", "DROPDOWN", [
          { text: "No", value: "false", selected: true },
          { text: "Yes", value: "true" }
        ]),
        dualButtonWidget(
          "Save Co-Investor",
          endpoint,
          {
            addonAction: "submit_add_co_investor",
            messageId: message.messageId,
            threadId: message.threadId
          },
          "Back",
          endpoint,
          { addonAction: "refresh_home", messageId: message.messageId, threadId: message.threadId }
        )
      ]
    }
  ]);
}

export function buildAddOpportunityCard(args: {
  endpoint: string;
  message: NormalizedMessageMetadata;
  companyOptions: Array<{ id: string; name: string }>;
  healthSystemOptions: Array<{ id: string; name: string }>;
}) {
  const { endpoint, message, companyOptions, healthSystemOptions } = args;

  return baseCard("Add Health System Opportunity", "Create a health system opportunity under a company", [
    {
      header: "Health system opportunity details",
      widgets: [
        ...(companyOptions.length > 0
          ? [
              selectionWidget(
                "opportunityCompanyId",
                "Company",
                "DROPDOWN",
                companyOptions.map((company, index) => ({
                  text: company.name,
                  value: company.id,
                  selected: index === 0
                }))
              )
            ]
          : [
              {
                textParagraph: {
                  text: "No candidate companies available. Add a company first."
                }
              }
            ]),
        textInputWidget("opportunityTitle", "Health system opportunity title", message.subject),
        selectionWidget("opportunityType", "Type", "DROPDOWN", [
          { text: "Prospect pursuit", value: "PROSPECT_PURSUIT", selected: true },
          { text: "Screening LOI", value: "SCREENING_LOI" },
          { text: "Venture studio services", value: "VENTURE_STUDIO_SERVICES" },
          { text: "S1 term sheet", value: "S1_TERM_SHEET" },
          { text: "Commercial contract", value: "COMMERCIAL_CONTRACT" }
        ]),
        selectionWidget("opportunityStage", "Stage", "DROPDOWN", [
          { text: "Identified", value: "IDENTIFIED", selected: true },
          { text: "Qualification", value: "QUALIFICATION" },
          { text: "Proposal", value: "PROPOSAL" },
          { text: "Negotiation", value: "NEGOTIATION" },
          { text: "Legal", value: "LEGAL" },
          { text: "On hold", value: "ON_HOLD" }
        ]),
        selectionWidget("opportunityHealthSystemId", "Health system (optional)", "DROPDOWN", [
          { text: "None", value: "", selected: true },
          ...healthSystemOptions.map((system) => ({ text: system.name, value: system.id }))
        ]),
        textInputWidget("opportunityNotes", "Notes (optional)", "", true),
        dualButtonWidget(
          "Save Health System Opportunity",
          endpoint,
          {
            addonAction: "submit_add_opportunity",
            messageId: message.messageId,
            threadId: message.threadId
          },
          "Back",
          endpoint,
          { addonAction: "refresh_home", messageId: message.messageId, threadId: message.threadId }
        )
      ]
    }
  ]);
}

export function buildSuccessCard(title: string, body: string, endpoint: string, message: NormalizedMessageMetadata) {
  return baseCard(title, "Saved in Abundant CRM", [
    {
      widgets: [
        {
          textParagraph: {
            text: body
          }
        },
        buttonWidget("Back to email summary", endpoint, {
          addonAction: "refresh_home",
          messageId: message.messageId,
          threadId: message.threadId
        })
      ]
    }
  ]);
}
