import {
  type MatchResults,
  type NormalizedMessageMetadata
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

function toActionParameters(parameters: Record<string, string | null | undefined>) {
  return Object.entries(parameters)
    .filter((entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string")
    .map(([key, value]) => ({ key, value }));
}

function buttonWidget(
  text: string,
  endpoint: string,
  parameters: Record<string, string | null | undefined>
): CardWidget {
  return {
    buttonList: {
      buttons: [
        {
          text,
          onClick: {
            action: {
              function: endpoint,
              parameters: toActionParameters(parameters)
            }
          }
        }
      ]
    }
  };
}

function dualButtonWidget(
  primaryText: string,
  primaryEndpoint: string,
  primaryParameters: Record<string, string | null | undefined>,
  secondaryText: string,
  secondaryEndpoint: string,
  secondaryParameters: Record<string, string | null | undefined>
): CardWidget {
  return {
    buttonList: {
      buttons: [
        {
          text: primaryText,
          onClick: {
            action: {
              function: primaryEndpoint,
              parameters: toActionParameters(primaryParameters)
            }
          }
        },
        {
          text: secondaryText,
          onClick: {
            action: {
              function: secondaryEndpoint,
              parameters: toActionParameters(secondaryParameters)
            }
          }
        }
      ]
    }
  };
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
  message: NormalizedMessageMetadata;
}) {
  const { message } = args;

  const metadataAvailable = Boolean(message.fromRaw || message.fromEmail || message.subject || message.dateRaw);

  const sections: CardSection[] = [
    {
      header: "Email preview",
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
    }
  ];

  return baseCard("Abundant CRM", "Gmail message preview", sections);
}

function targetItemsFromMatches(matches: MatchResults) {
  const items: Array<{ text: string; value: string; selected?: boolean }> = [];

  for (const contact of matches.contacts.slice(0, 4)) {
    items.push({ text: `Contact: ${contact.label}`, value: `CONTACT:${contact.id}` });
  }
  for (const company of matches.companies.slice(0, 4)) {
    items.push({ text: `Company: ${company.label}`, value: `COMPANY:${company.id}` });
  }
  for (const healthSystem of matches.healthSystems.slice(0, 4)) {
    items.push({ text: `Health system: ${healthSystem.label}`, value: `HEALTH_SYSTEM:${healthSystem.id}` });
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
                ? "Select one or more records. The add-on stores the email metadata and optional analyst note."
                : "No suggested records found. Use create actions first, then return to attach this message."
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
  const principalItems: Array<{ text: string; value: string; selected?: boolean }> = [
    { text: "No principal entity", value: "NONE", selected: true }
  ];

  for (const company of matches.companies.slice(0, 5)) {
    principalItems.push({ text: `Company: ${company.label}`, value: `COMPANY:${company.id}` });
  }
  for (const healthSystem of matches.healthSystems.slice(0, 5)) {
    principalItems.push({ text: `Health system: ${healthSystem.label}`, value: `HEALTH_SYSTEM:${healthSystem.id}` });
  }

  return baseCard("Add Contact", "Create or match contact from sender", [
    {
      header: "Contact details",
      widgets: [
        textInputWidget("contactName", "Name", message.fromName),
        textInputWidget("contactEmail", "Email", message.fromEmail),
        textInputWidget("contactTitle", "Title", ""),
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

  return baseCard("Add Company", "Create a company record", [
    {
      header: "Company details",
      widgets: [
        textInputWidget("companyName", "Company name", ""),
        textInputWidget("companyWebsite", "Website", ""),
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

  return baseCard("Add Health System", "Create a health system record", [
    {
      header: "Health system details",
      widgets: [
        textInputWidget("healthSystemName", "Health system name", ""),
        textInputWidget("healthSystemWebsite", "Website", ""),
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
