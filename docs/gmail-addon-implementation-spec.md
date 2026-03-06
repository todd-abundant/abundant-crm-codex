# Gmail Add-on Implementation Spec (Abundant CRM)

## 1. Objective

Build a Gmail-native workflow so users can, from an open email message:

- Review matched CRM records at a glance.
- Add a new contact.
- Add a health system.
- Add a company.
- Add an intake/pipeline opportunity.
- Attach the email as a note to selected CRM records.

Primary success metric: a user can open a message and attach it to CRM in less than 15 seconds.

## 2. Product Scope

### In scope (v1)

- Gmail message contextual card (open-message context).
- Existing record matching (contact/company/health system/opportunity suggestions).
- Create flows for contact, health system, company, opportunity.
- "Attach email as note" to one or more target records.
- Internal-only deployment to your Google Workspace domain first.

### Out of scope (v1)

- Full thread sync of entire mailbox.
- Automatic background ingestion of all emails.
- Attachment file ingestion to CRM document store.
- Public Marketplace launch.

## 3. Recommended Architecture

Use a **Google Workspace Gmail Add-on with HTTP endpoint runtime** and host callback endpoints in this Next.js app.

Why this fits your stack:

- You already have Next.js API routes, Prisma, and Google APIs dependency (`googleapis`).
- Business logic can stay in the CRM backend (single source of truth).
- No extra Apps Script codebase is required.

High-level request path:

1. User opens message in Gmail.
2. Gmail invokes add-on HTTP endpoint with event payload.
3. CRM endpoint verifies Google-issued tokens.
4. CRM reads message metadata/content via Gmail API using event tokens.
5. CRM returns add-on card JSON.
6. User clicks action (add/link/note); CRM persists via existing data model.
7. CRM returns updated card + success notification.

## 4. Security and Identity Model

Add-on endpoints should not depend on CRM session cookies. They should authenticate per request using Google add-on tokens.

### Required validations per request

1. Verify HTTP `Authorization: Bearer ...` token against add-on endpoint audience and expected service account email.
2. Verify `authorizationEventObject.userIdToken` (audience = add-on OAuth client ID), extract user email.
3. Find active CRM `User` by email.
4. Enforce role access (`USER` role minimum, consistent with current workbench access).

### Required middleware change

Current middleware blocks unauthenticated `/api/*` unless cookie-authenticated. Add-on endpoints must be excluded from cookie auth and do their own token verification.

Change: treat `"/api/addons/gmail"` as public in middleware routing checks.

## 5. Gmail Data Access Strategy

For v1 use minimal permissions:

- `gmail.addons.current.message.metadata`
- `userinfo.email`
- `gmail.addons.execute`

When add-on needs metadata, call Gmail API `users.messages.get` with:

- `Authorization: Bearer <authorizationEventObject.userOAuthToken>`
- `X-Goog-Gmail-Access-Token: <gmail.accessToken>`
- `format=metadata` and targeted headers (`From`, `To`, `Cc`, `Bcc`, `Subject`, `Date`, `Message-Id`)

Upgrade to message-body scopes only if needed after adoption.

## 6. Existing CRM APIs/Models to Reuse

### Existing routes already suitable

- Entity search: `POST /api/entity-search`
- Create contact: `POST /api/contacts`
- Create company: `POST /api/companies`
- Create health system: `POST /api/health-systems`
- Create opportunity under company: `POST /api/pipeline/opportunities/[companyId]/opportunities`
- Link contact to opportunity: `POST /api/pipeline/opportunities/[companyId]/opportunity-contacts`
- Add notes (entity routes):
  - `POST /api/contacts/[id]/notes`
  - `POST /api/companies/[id]/notes`
  - `POST /api/health-systems/[id]/notes`
- Pipeline propagated notes (company + affiliated entities):
  - `POST /api/pipeline/opportunities/[companyId]/notes`

### Existing schema pieces aligned to feature

- `Contact`, `Company`, `HealthSystem`, `CompanyOpportunity`
- `EntityNote` with `affiliations` JSON
- `CompanyOpportunityContact`

## 7. New Backend Components

## 7.1 Endpoints

Create a dedicated add-on endpoint group:

- `POST /api/addons/gmail/execute`

Pattern: single callback endpoint handling triggers and action callbacks based on event payload and action parameters.

Optional split if preferred:

- `POST /api/addons/gmail/home`
- `POST /api/addons/gmail/action`

## 7.2 New modules

- `lib/gmail-addon/auth.ts`
  - Verify system token and user token.
  - Resolve active CRM user.
- `lib/gmail-addon/gmail.ts`
  - Fetch normalized Gmail message metadata.
- `lib/gmail-addon/match.ts`
  - Matching logic against contact/company/health system/opportunity.
- `lib/gmail-addon/cards.ts`
  - Build JSON cards for home, create forms, success/error states.
- `lib/gmail-addon/actions.ts`
  - Action handlers (create entities, attach notes, link contacts).

## 7.3 Optional v1.1 schema addition (recommended)

Add idempotency/audit table so attaching the same email twice can be detected cleanly:

- `ExternalMessageCapture`
  - `provider` (`GMAIL`)
  - `externalMessageId` (`gmail.messageId`)
  - `threadId`
  - `internetMessageId`
  - `entityKind`, `entityId`
  - `noteId`
  - `capturedByUserId`
  - timestamps
  - unique index on `(provider, externalMessageId, entityKind, entityId)`

This is optional for week 1; if skipped, include marker token in note text and dedupe by query.

## 8. Card UX Flow

## 8.1 Message Open Card (default)

Sections:

1. Email summary
- From
- Subject
- Date

2. Suggested matches
- Top contact match
- Top company match
- Top health system match
- Optional opportunity match

3. Quick actions
- `Attach Email as Note`
- `Add Contact`
- `Add Company`
- `Add Health System`
- `Add Opportunity`

## 8.2 Attach Email as Note flow

User can choose one or more targets:

- Contact
- Company
- Health system
- Opportunity (if selected, write via pipeline note path for affiliations)

Optional note prefix field for analyst context.

Stored note body template:

```text
[Email Capture]
Subject: {subject}
From: {from}
To: {to}
Date: {date}
Gmail Message ID: {messageId}
Gmail Thread ID: {threadId}

{optional user note}
```

If opportunity target is selected:

- Use `POST /api/pipeline/opportunities/{companyId}/notes` with `opportunityId`.

Else per entity target:

- Use entity note endpoints above.

## 8.3 Add Contact flow

Prefill from sender:

- `name` from From header parse
- `email` from From header

Inputs:

- name (required)
- title
- phone
- linkedin
- principal entity type + principal entity (optional but recommended)

Persist with:

- `POST /api/contacts`

If principal selected, pass `principalEntityType`, `principalEntityId`, and role type.

## 8.4 Add Company flow

Inputs:

- company name (required)
- website (optional)
- city/state/country (optional)
- company type (default `STARTUP`)

Persist with:

- `POST /api/companies`

Use defaults from existing `companyInputSchema` for omitted fields.

## 8.5 Add Health System flow

Inputs:

- name (required)
- website (optional)
- city/state/country (optional)
- alliance member toggle (optional)

Persist with:

- `POST /api/health-systems`

## 8.6 Add Opportunity flow

Inputs:

- company (required)
- title (required)
- type (required; default `PROSPECT_PURSUIT`)
- health system (optional)
- stage (default `IDENTIFIED`)

Persist with:

- `POST /api/pipeline/opportunities/{companyId}/opportunities`

Optional follow-up action:

- link matched/new contact via `POST /api/pipeline/opportunities/{companyId}/opportunity-contacts`

## 9. Matching Logic (v1)

Scoring inputs:

- Sender email exact match against `Contact.email` (highest weight).
- Sender domain to company/health system website domain (medium weight).
- Sender display name fuzzy match against contact name (medium weight).
- Subject keyword match to opportunity title (low-medium weight).

Candidate retrieval:

- Contacts/companies/health systems via `POST /api/entity-search`.
- Opportunities via direct Prisma query in add-on service (subject token contains search).

Return top 1-3 per entity type with confidence labels (`high`, `medium`, `low`).

## 10. Proposed Implementation Steps (Code-Level)

1. Add middleware exception for `/api/addons/gmail/*`.
2. Add add-on auth/token verification utility.
3. Add Gmail metadata fetch utility using event tokens.
4. Add add-on execute route with action router.
5. Add card builder functions for all states/actions.
6. Add action handlers using existing CRM APIs/services.
7. Add idempotency (table or marker-based dedupe).
8. Add structured logging (`addon_action`, `addon_user`, `gmail_message_id`, latency, outcome).
9. Add metrics counters.

## 11. Environment and Config

New env vars:

- `GMAIL_ADDON_ENDPOINT_AUDIENCE` (exact HTTPS endpoint URL)
- `GMAIL_ADDON_SERVICE_ACCOUNT_EMAIL`
- `GMAIL_ADDON_OAUTH_CLIENT_ID`
- `GMAIL_ADDON_ENABLED=true|false`

Marketplace/HTTP deployment config:

- Gmail host enabled in manifest.
- Contextual trigger for message open.
- OAuth scopes explicitly set.

## 12. Testing Strategy

## 12.1 Unit

- Token verification (valid/invalid/audience mismatch/service-account mismatch).
- Message metadata normalization.
- Matching score ordering.
- Card JSON shape snapshots.

## 12.2 Integration

- End-to-end callback with mocked Gmail event payload.
- Create contact/company/health system/opportunity actions.
- Attach note actions per target type.
- Duplicate attach behavior.

## 12.3 Manual UAT checklist

- Install unpublished add-on.
- Open real Gmail message and verify suggestions.
- Create new contact from sender.
- Attach message to company + opportunity.
- Confirm note appears in CRM record pages.
- Verify permissions for user without `USER` role.

## 13. 2-Week Delivery Plan

## Week 1 (foundation + core value)

Day 1:
- Create add-on Cloud project/deployment skeleton.
- Add manifest scopes and Gmail contextual trigger.
- Add endpoint scaffolding in CRM repo.

Day 2:
- Implement request authentication (system + user token verification).
- Add role checks and middleware exception.

Day 3:
- Implement Gmail metadata fetch utility.
- Build initial "Message Summary + Suggestions" card.

Day 4:
- Implement matching service (contact/company/health system).
- Wire entity-search integration.

Day 5:
- Implement "Attach Email as Note" action for contact/company/health system.
- Add idempotency v0 (marker-based or table if ready).

## Week 2 (entity creation + polish)

Day 6:
- Add "Create Contact" action/form and persistence.

Day 7:
- Add "Create Company" and "Create Health System" actions/forms.

Day 8:
- Add "Create Opportunity" action/form under selected company.
- Optional contact-opportunity linking action.

Day 9:
- Improve card UX, errors, loading states, success notifications.
- Add observability logs and basic metrics.

Day 10:
- UAT with pilot users.
- Fixes, documentation, rollout checklist, and admin install instructions.

## 14. Rollout Plan

Phase 1: Internal pilot (5-10 users)
- Deploy unpublished/private app.
- Validate speed, match quality, and note utility.

Phase 2: Domain-wide private deployment
- Admin install for organization.
- Monitor action success rate and error rate.

Phase 3: Scope expansion decision
- If users need body parsing or attachments, evaluate moving from metadata-only to broader Gmail scope.

## 15. Risks and Mitigations

1. Auth complexity between Google add-on and CRM
- Mitigation: strict token verification with clear env-configured audiences.

2. Over-broad Gmail scopes slow review
- Mitigation: start with metadata scope only.

3. Duplicate note creation
- Mitigation: idempotency key on `(provider, messageId, entity)`.

4. Match quality issues
- Mitigation: confidence labels + always allow manual override.

5. Mobile expectations mismatch
- Mitigation: communicate desktop-first behavior; Gmail mobile contextual support is limited.

## 16. Acceptance Criteria

1. From an open Gmail message, user sees CRM suggestions in under 2 seconds p95.
2. User can create contact/company/health system/opportunity from add-on without opening CRM web UI.
3. User can attach message as note to selected entity/entities.
4. Duplicate attach attempts are prevented or clearly flagged.
5. All add-on write actions are attributable to CRM user identity.
6. Pilot users report reduced CRM update friction.

## 17. Repository Impact (Expected)

Likely files/folders to add/update:

- `app/api/addons/gmail/execute/route.ts` (new)
- `lib/gmail-addon/*` (new)
- `middleware.ts` (update)
- `prisma/schema.prisma` + migration (optional, if idempotency table added)
- `docs/gmail-addon-runbook.md` (new operational runbook)

## 18. References

- Google Workspace add-ons HTTP runtimes:
  - https://developers.google.com/workspace/add-ons/guides/alternate-runtimes
- Event object (Gmail fields):
  - https://developers.google.com/workspace/add-ons/concepts/event-objects
- Gmail add-on scopes and restricted scopes guidance:
  - https://developers.google.com/workspace/add-ons/concepts/workspace-scopes
- Gmail message UI extension:
  - https://developers.google.com/workspace/add-ons/gmail/extending-message-ui
- Add-on restrictions (desktop/mobile behavior):
  - https://developers.google.com/workspace/add-ons/guides/workspace-restrictions
- Gmail API users.messages.get:
  - https://developers.google.com/gmail/api/v1/reference/users/messages/get
- Marketplace SDK visibility/configuration:
  - https://developers.google.com/workspace/marketplace/enable-configure-sdk
