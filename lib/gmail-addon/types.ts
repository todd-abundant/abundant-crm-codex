export type AddonAction =
  | "home"
  | "refresh_home"
  | "nav_attach_note"
  | "nav_add_contact"
  | "nav_add_company"
  | "nav_add_health_system"
  | "nav_add_opportunity"
  | "submit_attach_note"
  | "submit_add_contact"
  | "submit_add_company"
  | "submit_add_health_system"
  | "submit_add_opportunity";

export type AddonEntityKind = "CONTACT" | "COMPANY" | "HEALTH_SYSTEM" | "OPPORTUNITY";

type StringInputsValue = {
  value?: string[];
};

type FormInputValue = {
  stringInputs?: StringInputsValue;
};

export type GmailAddonEvent = {
  authorizationEventObject?: {
    userIdToken?: string;
    userOAuthToken?: string;
    userOauthToken?: string;
    systemIdToken?: string;
    authorizedScopes?: string[];
  };
  commonEventObject?: {
    hostApp?: string;
    parameters?: Record<string, string>;
    formInputs?: Record<string, FormInputValue>;
  };
  gmail?: {
    messageId?: string;
    threadId?: string;
    accessToken?: string;
  };
  messageMetadata?: {
    messageId?: string;
    threadId?: string;
    accessToken?: string;
  };
};

export type AddonActor = {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
};

export type NormalizedMessageMetadata = {
  messageId: string | null;
  threadId: string | null;
  internetMessageId: string;
  subject: string;
  fromRaw: string;
  fromName: string;
  fromEmail: string;
  toRaw: string;
  ccRaw: string;
  dateRaw: string;
  snippet: string;
};

export type MatchCandidate = {
  id: string;
  label: string;
  subtitle: string | null;
  confidence: "high" | "medium" | "low";
};

export type OpportunityMatchCandidate = MatchCandidate & {
  companyId: string;
};

export type MatchResults = {
  contacts: MatchCandidate[];
  companies: MatchCandidate[];
  healthSystems: MatchCandidate[];
  opportunities: OpportunityMatchCandidate[];
};

export function getEventParameters(event: GmailAddonEvent): Record<string, string> {
  return event.commonEventObject?.parameters || {};
}

function getRawFormValue(event: GmailAddonEvent, name: string) {
  return event.commonEventObject?.formInputs?.[name];
}

export function getFormValues(event: GmailAddonEvent, name: string): string[] {
  const values = getRawFormValue(event, name)?.stringInputs?.value;
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean);
}

export function getFormValue(event: GmailAddonEvent, name: string): string | null {
  const values = getFormValues(event, name);
  return values[0] || null;
}

export function resolveAddonAction(event: GmailAddonEvent): string {
  const action = getEventParameters(event).addonAction;
  if (!action) return "home";
  return action;
}

export function resolveMessageTokens(event: GmailAddonEvent) {
  const gmail = event.gmail || event.messageMetadata;
  const userOAuthToken =
    event.authorizationEventObject?.userOAuthToken || event.authorizationEventObject?.userOauthToken || null;

  return {
    messageId: gmail?.messageId || null,
    threadId: gmail?.threadId || null,
    gmailAccessToken: gmail?.accessToken || null,
    userOAuthToken
  };
}

export function toNullableTrimmed(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isTruthyInput(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}
