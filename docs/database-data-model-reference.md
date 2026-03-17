# Abundant CRM Database Data Model Reference

This reference is based on the Prisma schema and current write paths in the app as of 2026-03-17.

Primary source files:
- `prisma/schema.prisma`
- `app/api/companies/route.ts`
- `app/api/health-systems/route.ts`
- `app/api/co-investors/route.ts`
- `app/api/contacts/route.ts`
- `lib/contact-resolution.ts`
- `lib/entity-record-content.ts`
- `lib/screening-opportunity-sync.ts`
- `lib/gmail-addon/actions.ts`

## Conventions

- Database: PostgreSQL via Prisma.
- Primary IDs: `String @id @default(cuid())` unless otherwise noted.
- Timestamps:
  - `createdAt` usually defaults to `now()`.
  - `updatedAt` is usually `@updatedAt`.
- Money fields are `Decimal(16,2)` unless otherwise noted.
- Percentage ownership fields are `Decimal(7,2)`.
- Nullable fields mean "unknown / not applicable / not yet collected".
- Many child tables use `onDelete: Cascade`. Nullable parent references often use `onDelete: SetNull`.

## Authoritative vs mirrored/system-managed records

Use these rules when another AI suggests inserts or updates:

- Authoritative core CRM records:
  - `Company`
  - `HealthSystem`
  - `CoInvestor`
  - `Contact`
  - `EntityNote`
  - `EntityDocument`
  - `CompanyOpportunity`
  - `CompanyPipeline`
  - association/link tables

- Mirrored / derived records:
  - `HealthSystemOpportunity` mirrors `CompanyOpportunity` and should use the same `id`.
  - `HealthSystemOpportunityContact` mirrors `CompanyOpportunityContact`.
  - `CompanyLoi` may be derived from screening / opportunity state in some flows.

- Mostly system-managed / not typical targets for email-transcript extraction:
  - research job tables
  - signal event tables
  - screening survey session / submission / answer tables
  - `CompanyReport`
  - `StakeholderSignalsDigestDispatch`

## Important write rules

- Prefer updating existing records over creating duplicates.
- Contact dedupe logic in app:
  - first by normalized LinkedIn URL
  - then by normalized email
  - then by fuzzy name match, helped by title
- Company duplicate detection in app create flow:
  - same normalized name, plus matching normalized website or matching location pieces
- `CompanyPipeline` is optional in the schema, but a company created through the main company API gets a pipeline row immediately. For pipeline-tracked companies, create or upsert `CompanyPipeline`.
- `CompanyHealthSystemLink` and `CompanyCoInvestorLink` do not have DB-enforced unique constraints on their logical pairs. Treat `(companyId, healthSystemId)` and `(companyId, coInvestorId)` as logical unique keys in your own logic.
- `CompanyOpportunity` is the canonical opportunity table. Mirror create/update/delete into `HealthSystemOpportunity`.
- When linking contacts to an opportunity, also mirror into `HealthSystemOpportunityContact`.
- Notes about an opportunity are not stored in a dedicated opportunity notes table. They are stored as `EntityNote` rows on the company and may also be propagated to related health systems and contacts, with `affiliations` JSON referencing the opportunity.
- Email capture should also write `ExternalMessageCapture` for idempotency. Its unique key is `(provider, externalMessageId, entityKind, entityId)`.

## Enum values

### Research and workflow enums

- `ResearchStatus`: `DRAFT`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`
- `CoInvestorResearchStatus`: `DRAFT`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`
- `CoInvestorInteractionType`: `MEETING`, `EMAIL`, `CALL`, `EVENT`, `INTRO`, `NOTE`
- `NextActionStatus`: `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELLED`
- `NextActionPriority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT`

### Company enums

- `CompanyType`: `STARTUP`, `SPIN_OUT`, `DENOVO`
- `CompanyPrimaryCategory`:
  - `PATIENT_ACCESS_AND_GROWTH`
  - `CARE_DELIVERY_TECH_ENABLED_SERVICES`
  - `CLINICAL_WORKFLOW_AND_PRODUCTIVITY`
  - `REVENUE_CYCLE_AND_FINANCIAL_OPERATIONS`
  - `VALUE_BASED_CARE_AND_POPULATION_HEALTH_ENABLEMENT`
  - `AI_ENABLED_AUTOMATION_AND_DECISION_SUPPORT`
  - `DATA_PLATFORM_INTEROPERABILITY_AND_INTEGRATION`
  - `REMOTE_PATIENT_MONITORING_AND_CONNECTED_DEVICES`
  - `DIAGNOSTICS_IMAGING_AND_TESTING_ENABLEMENT`
  - `PHARMACY_AND_MEDICATION_ENABLEMENT`
  - `SUPPLY_CHAIN_PROCUREMENT_AND_ASSET_OPERATIONS`
  - `SECURITY_PRIVACY_AND_COMPLIANCE_INFRASTRUCTURE`
  - `PROVIDER_EXPERIENCE_AND_DEVELOPMENT`
  - `OTHER`
- `CompanyDeclineReason`:
  - `PRODUCT`
  - `INSUFFICIENT_ROI`
  - `HIGHLY_COMPETITIVE_LANDSCAPE`
  - `OUT_OF_INVESTMENT_THESIS_SCOPE`
  - `TOO_EARLY`
  - `TOO_MATURE_FOR_SEED_INVESTMENT`
  - `LACKS_PROOF_POINTS`
  - `INSUFFICIENT_TAM`
  - `TEAM`
  - `HEALTH_SYSTEM_BUYING_PROCESS`
  - `WORKFLOW_FRICTION`
  - `OTHER`
- `CompanyPipelineCategory`: `ACTIVE`, `CLOSED`, `RE_ENGAGE_LATER`
- `CompanyPipelineIntakeStage`: `RECEIVED`, `INTRO_CALLS`, `ACTIVE_INTAKE`, `MANAGEMENT_PRESENTATION`
- `CompanyClosedOutcome`: `INVESTED`, `PASSED`, `LOST`, `WITHDREW`, `OTHER`
- `CompanyIntakeStatus`: `NOT_SCHEDULED`, `SCHEDULED`, `COMPLETED`, `SCREENING_EVALUATION`
- `CompanyLeadSourceType`: `HEALTH_SYSTEM`, `OTHER`
- `PipelineLeadSourceType`: `INSIDE_OUT`, `ALLIANCE_REFERRAL`, `CO_INVESTOR_REFERRAL`, `COLD_INBOUND`, `WARM_INTRO`, `OTHER`
- `PipelineCompanyType`: `DE_NOVO`, `SPIN_OUT`, `EARLY_STAGE`
- `PipelineFundingStage`: `PRE_SEED`, `SEED`, `SERIES_A`, `SERIES_B`, `OTHER`
- `PipelineIntakeStep`: `INITIAL_CALL`, `DEEPER_DIVE`, `PROPOSAL_REVIEW`, `MANAGEMENT_PRESENTATION`
- `PipelineLeadSourceEntityType`: `CONTACT`, `HEALTH_SYSTEM`, `CO_INVESTOR`
- `CompanyHealthSystemRelationship`: `CUSTOMER`, `SPIN_OUT_PARTNER`, `INVESTOR_PARTNER`, `OTHER`
- `CompanyHealthSystemPreliminaryInterest`: `EXPRESSED_INTEREST`, `REQUESTED_MORE_INFO`, `INTRO_CALL_SCHEDULED`, `SCREENING_RECOMMENDED`
- `CompanyHealthSystemCurrentState`: `ACTIVE_SCREENING`, `LOI_SIGNED`, `CO_DEV`, `COMMERCIAL_AGREEMENT`, `PASSED`, `REVISIT`
- `CompanyCoInvestorRelationship`: `INVESTOR`, `PARTNER`, `OTHER`
- `CompanyPipelinePhase`: `INTAKE`, `DECLINED`, `VENTURE_STUDIO_NEGOTIATION`, `SCREENING`, `LOI_COLLECTION`, `COMMERCIAL_NEGOTIATION`, `PORTFOLIO_GROWTH`, `CLOSED`
- `CompanyIntakeDecision`: `PENDING`, `ADVANCE_TO_NEGOTIATION`, `DECLINE`, `REVISIT_LATER`
- `CompanyDocumentType`: `INTAKE_REPORT`, `SCREENING_REPORT`, `OPPORTUNITY_REPORT`, `TERM_SHEET`, `VENTURE_STUDIO_CONTRACT`, `LOI`, `COMMERCIAL_CONTRACT`, `OTHER`
- `CompanyReportType`: `INTAKE`, `SCREENING`, `OPPORTUNITY`
- `CompanyReportStatus`: `DRAFT`, `PUBLISHED`, `ARCHIVED`
- `CompanyFundraiseStatus`: `PLANNED`, `OPEN`, `CLOSED`, `CANCELLED`

### Opportunities and screening enums

- `CompanyOpportunityType`: `SCREENING_LOI`, `VENTURE_STUDIO_SERVICES`, `S1_TERM_SHEET`, `COMMERCIAL_CONTRACT`, `PROSPECT_PURSUIT`
- `CompanyOpportunityStage`: `IDENTIFIED`, `QUALIFICATION`, `PROPOSAL`, `NEGOTIATION`, `LEGAL`, `CLOSED_WON`, `CLOSED_LOST`, `ON_HOLD`
- `CompanyScreeningEventType`: `WEBINAR`, `INDIVIDUAL_SESSION`, `OTHER`
- `CompanyScreeningAttendanceStatus`: `INVITED`, `ATTENDED`, `DECLINED`, `NO_SHOW`
- `CompanyLoiStatus`: `NOT_STARTED`, `PENDING`, `NEGOTIATING`, `SIGNED`, `DECLINED`
- `CompanyScreeningFeedbackSentiment`: `POSITIVE`, `MIXED`, `NEUTRAL`, `NEGATIVE`
- `CompanyScreeningCellField`: `RELEVANT_FEEDBACK`, `STATUS_UPDATE`, `MEMBER_FEEDBACK_STATUS`
- `CompanyScreeningSurveySessionStatus`: `DRAFT`, `LIVE`, `CLOSED`

### Shared entity / user enums

- `EntityKind`: `HEALTH_SYSTEM`, `CO_INVESTOR`, `COMPANY`, `CONTACT`
- `ExternalMessageProvider`: `GMAIL`
- `AllianceMemberStatus`: `YES`, `NO`, `PROSPECT`
- `ContactRoleType`: `EXECUTIVE`, `VENTURE_PARTNER`, `INVESTOR_PARTNER`, `COMPANY_CONTACT`, `OTHER`
- `ContactPrincipalEntityType`: `HEALTH_SYSTEM`, `CO_INVESTOR`, `COMPANY`
- `UserRole`: `EXECUTIVE`, `USER`, `ADMINISTRATOR`
- `StakeholderSignalsDigestDispatchStatus`: `PENDING`, `SENT`, `FAILED`, `SKIPPED`

## Model reference

### Health systems and related tables

- `HealthSystem`
  - Core organization record for provider systems.
  - Required: `id`, `name`, `isLimitedPartner`, `isAllianceMember`, `allianceMemberStatus`, `researchStatus`, `createdAt`, `updatedAt`.
  - Optional details: `legalName`, `website`, `logoUrl`, `headquartersCity`, `headquartersState`, `headquartersCountry`, `netPatientRevenueUsd`, `limitedPartnerInvestmentUsd`, `hasInnovationTeam`, `hasVentureTeam`, `ventureTeamSummary`, `researchNotes`, `researchError`, `researchUpdatedAt`.
  - Relationships: `Executive`, `VenturePartner`, `HealthSystemInvestment`, `HealthSystemResearchJob`, `Company` as lead source, `CompanyHealthSystemLink`, `ContactHealthSystem`, `CompanyOpportunity`, `CompanyScreeningParticipant`, `CompanyLoi`, `CompanyScreeningDocument`, quantitative and qualitative screening feedback, screening cell changes, survey submissions, `HealthSystemSignalEvent`.

- `Executive`
  - Executive contact fragment attached directly to a health system.
  - Fields: `id`, `healthSystemId`, `name`, optional `title`, optional `linkedinUrl`, `createdAt`.
  - No dedupe constraint beyond `id`.

- `VenturePartner`
  - Venture / innovation partner attached to a health system.
  - Fields: `id`, `healthSystemId`, `name`, optional `coInvestorId`, optional `title`, optional `profileUrl`, `createdAt`.
  - Optional link to `CoInvestor`.

- `HealthSystemInvestment`
  - Portfolio or investment record from a health system into a company.
  - Fields: `id`, `healthSystemId`, `portfolioCompanyName`, optional `companyId`, optional `investmentAmountUsd`, optional `investmentDate`, optional `leadPartnerName`, optional `sourceUrl`, `createdAt`.
  - `companyId` is nullable; use it when you can match to an internal `Company`.

- `HealthSystemResearchJob`
  - Queue / run log for automated health-system research.
  - Fields: `id`, `healthSystemId`, `status`, `searchName`, optional selected city/state/country/website, optional `startedAt`, optional `completedAt`, optional `errorMessage`, `createdAt`, `updatedAt`.
  - Usually system-managed.

- `HealthSystemSignalEvent`
  - Machine-curated news / signal item tied to a health system.
  - Fields: `id`, `healthSystemId`, `eventType`, `headline`, `summary`, optional `suggestedOutreach`, optional `confidenceScore`, optional `relevanceScore`, optional `signalDate`, `sourceUrl`, optional `sourceDomain`, optional `sourceTitle`, optional `sourcePublishedAt`, `dedupeKey`, optional `metadataJson`, `createdAt`, `updatedAt`.
  - Unique on `(healthSystemId, dedupeKey)`.

### Co-investors and related tables

- `CoInvestor`
  - Core organization record for funds / investors / partners.
  - Required: `id`, `name`, `isSeedInvestor`, `isSeriesAInvestor`, `researchStatus`, `createdAt`, `updatedAt`.
  - Optional: `legalName`, `website`, headquarters fields, `investmentNotes`, `researchNotes`, `researchError`, `researchUpdatedAt`.
  - Relationships: `CoInvestorPartner`, `CoInvestorInvestment`, `CoInvestorResearchJob`, `CompanyCoInvestorLink`, `ContactCoInvestor`, `VenturePartner`, `CoInvestorInteraction`, `NextAction`, `CoInvestorSignalEvent`, `CompanyFundraiseInvestor`.

- `CoInvestorPartner`
  - Person record attached directly to a co-investor.
  - Fields: `id`, `coInvestorId`, `name`, optional `title`, optional `profileUrl`, `createdAt`.

- `CoInvestorInvestment`
  - Portfolio investment attributed to a co-investor.
  - Fields: `id`, `coInvestorId`, `portfolioCompanyName`, optional `investmentAmountUsd`, optional `investmentDate`, optional `investmentStage`, optional `leadPartnerName`, optional `sourceUrl`, `createdAt`.

- `CoInvestorResearchJob`
  - Queue / run log for automated co-investor research.
  - Fields: `id`, `coInvestorId`, `status`, `searchName`, optional selected city/state/country/website, optional `startedAt`, optional `completedAt`, optional `errorMessage`, `createdAt`, `updatedAt`.
  - Usually system-managed.

- `CoInvestorInteraction`
  - CRM interaction log for a co-investor.
  - Fields: `id`, `coInvestorId`, `interactionType`, optional `channel`, optional `subject`, optional `summary`, `occurredAt`, `createdAt`, `updatedAt`.

- `NextAction`
  - Task / follow-up attached to a co-investor.
  - Fields: `id`, `coInvestorId`, `title`, optional `details`, optional `ownerName`, optional `dueAt`, optional `completedAt`, `status`, `priority`, `createdAt`, `updatedAt`.

- `CoInvestorSignalEvent`
  - Machine-curated signal item tied to a co-investor.
  - Same shape as the health-system/company/contact signal tables.
  - Unique on `(coInvestorId, dedupeKey)`.

### Companies, pipeline, and company-adjacent tables

- `Company`
  - Core startup / company record.
  - Required: `id`, `name`, `companyType`, `primaryCategory`, `leadSourceType`, `intakeStatus`, `researchStatus`, `createdAt`, `updatedAt`.
  - Optional identity / profile fields: `legalName`, `website`, HQ fields, `description`, `googleTranscriptUrl`.
  - Optional classification / decline fields: `primaryCategoryOther`, `declineReason`, `declineReasonOther`.
  - Optional lead-source fields: `leadSourceHealthSystemId`, `leadSourceOther`, `leadSourceNotes`.
  - Optional "at a glance" fields: `atAGlanceProblem`, `atAGlanceSolution`, `atAGlanceImpact`, `atAGlanceKeyStrengths`, `atAGlanceKeyConsiderations`.
  - Optional transaction/status fields: `spinOutOwnershipPercent`, `intakeScheduledAt`, `screeningEvaluationAt`, `researchNotes`, `researchError`, `researchUpdatedAt`.
  - Relationships: `HealthSystem` lead source, `CompanyHealthSystemLink`, `CompanyCoInvestorLink`, `ContactCompany`, `CompanyResearchJob`, optional `CompanyPipeline`, `HealthSystemInvestment`, `CompanyDocument`, `CompanyOpportunity`, screening/event/LOI/feedback/survey tables, optional `CompanyMarketLandscape`, `CompanyReport`, `CompanyFundraise`, `CompanySignalEvent`.

- `CompanySignalEvent`
  - Machine-curated signal item tied to a company.
  - Same shape as other signal-event tables.
  - Unique on `(companyId, dedupeKey)`.

- `CompanyHealthSystemLink`
  - Many-to-many relationship between company and health system.
  - Fields: `id`, `companyId`, `healthSystemId`, `relationshipType`, optional `preliminaryInterest`, optional `currentState`, optional `notes`, optional `investmentAmountUsd`, optional `ownershipPercent`, `createdAt`.
  - Application treats `(companyId, healthSystemId)` as a logical unique pair, but the DB does not enforce uniqueness.

- `CompanyCoInvestorLink`
  - Many-to-many relationship between company and co-investor.
  - Fields: `id`, `companyId`, `coInvestorId`, `relationshipType`, optional `notes`, optional `investmentAmountUsd`, `createdAt`.
  - Application should treat `(companyId, coInvestorId)` as a logical unique pair even though the DB does not enforce uniqueness.

- `CompanyResearchJob`
  - Queue / run log for automated company research.
  - Fields: `id`, `companyId`, `status`, `searchName`, optional selected city/state/country/website, optional `startedAt`, optional `completedAt`, optional `errorMessage`, `createdAt`, `updatedAt`.
  - Usually system-managed.

- `CompanyPipeline`
  - Optional 1:1 pipeline / intake / venture workflow state for a company.
  - Unique key: `companyId`.
  - Fields:
    - state fields: `phase`, `stageChangedAt`, `category`, `intakeStage`, optional `closedOutcome`, `intakeDecision`, optional `intakeDecisionAt`, optional `intakeDecisionNotes`
    - workflow fields: optional `nextStep`, optional `nextStepDueAt`, optional `lastMeaningfulActivityAt`, optional `ownerName`, optional `declineReasonNotes`, optional `coInvestorEngagement`, optional `dealFlowContribution`
    - venture / deal fields: optional `ventureStudioContractExecutedAt`, optional `screeningWebinarDate1At`, optional `screeningWebinarDate2At`, optional `ventureLikelihoodPercent`, optional `ventureExpectedCloseDate`, `targetLoiCount`, `s1Invested`, optional `s1InvestmentAt`, optional `s1InvestmentAmountUsd`, optional `ventureStudioCriteria`
    - intake snapshot fields: optional `portfolioAddedAt`, optional `leadSourceType`, optional `leadSourceEntityType`, optional `leadSourceEntityId`, optional `leadSourceEntityName`, optional `pipelineCompanyType`, optional `fundingStage`, optional `amountRaising`, optional `targetCustomer`, optional `valueProp`, optional `submittingHealthSystemId`, optional `intakeStep`
    - timestamps: `createdAt`, `updatedAt`
  - Use this when a company is being actively managed in pipeline.

- `CompanyMarketLandscape`
  - Optional 1:1 market landscape definition for a company.
  - Unique key: `companyId`.
  - Fields: `id`, `companyId`, `sectionLabel`, `headline`, `subheadline`, `template`, `xAxisLabel`, `yAxisLabel`, `columnLabel1`, `columnLabel2`, `rowLabel1`, `rowLabel2`, optional `primaryFocusCellKey`, `createdAt`, `updatedAt`.

- `CompanyMarketLandscapeCard`
  - A single card / competitor entry inside a market landscape.
  - Fields: `id`, `marketLandscapeId`, `cellKey`, `sortOrder`, `title`, `overview`, `businessModel`, `strengths`, `gaps`, `vendors`, `createdAt`, `updatedAt`.
  - Unique on `(marketLandscapeId, cellKey)`.

- `CompanyPipelineNote`
  - Simple freeform note attached directly to a company pipeline card.
  - Fields: `id`, `companyId`, `note`, `createdAt`, `updatedAt`.
  - Distinct from the more general `EntityNote` system.

- `CompanyDocument`
  - Company-scoped document.
  - Fields: `id`, `companyId`, `type`, `title`, `url`, `uploadedAt`, optional `notes`, `createdAt`.

- `CompanyReport`
  - Rendered report artifact for a company.
  - Fields: `id`, `companyId`, `type`, `status`, `templateVersion`, `title`, optional `subtitle`, optional `audienceLabel`, optional `confidentialityLabel`, optional `periodStart`, optional `periodEnd`, required `sourceSnapshotJson`, required `sectionStateJson`, optional `renderedHtml`, optional `publishedAt`, optional `createdByUserId`, `createdAt`, `updatedAt`.
  - Usually system-managed.

### Shared content and email-capture tables

- `EntityDocument`
  - Generic document store for `HEALTH_SYSTEM`, `CO_INVESTOR`, `COMPANY`, or `CONTACT`.
  - Fields: `id`, `entityKind`, `entityId`, `title`, `url`, optional `notes`, `uploadedAt`, `createdAt`, `updatedAt`.

- `EntityNote`
  - Generic note store for `HEALTH_SYSTEM`, `CO_INVESTOR`, `COMPANY`, or `CONTACT`.
  - Fields: `id`, `entityKind`, `entityId`, `note`, optional `affiliations` JSON, optional `createdByUserId`, optional `createdByName`, `createdAt`, `updatedAt`.
  - `affiliations` is JSON and can reference related company / health system / contact / opportunity context.

- `EntityNoteDocument`
  - Join table between notes and generic entity documents.
  - Fields: `noteId`, `documentId`, `attachedAt`.
  - Primary key is `(noteId, documentId)`.

- `ExternalMessageCapture`
  - Idempotency / provenance record for captured external messages, currently Gmail only.
  - Fields: `id`, `provider`, `externalMessageId`, optional `threadId`, optional `internetMessageId`, `entityKind`, `entityId`, optional `noteId`, optional `capturedByUserId`, `createdAt`, `updatedAt`.
  - Unique on `(provider, externalMessageId, entityKind, entityId)`.

### Opportunities, LOIs, screening, surveys, and fundraising

- `CompanyOpportunity`
  - Canonical opportunity table.
  - Fields: `id`, `companyId`, optional `healthSystemId`, `type`, `title`, `stage`, optional `likelihoodPercent`, optional `contractPriceUsd`, optional `durationDays`, optional `preliminaryInterestOverride`, optional `memberFeedbackStatus`, optional `notes`, optional `nextSteps`, optional `closeReason`, optional `estimatedCloseDate`, optional `closedAt`, `createdAt`, `updatedAt`.
  - Relationships: `Company`, optional `HealthSystem`, `CompanyOpportunityContact`.
  - This is the record to create or update first.

- `CompanyOpportunityContact`
  - Contact link for an opportunity.
  - Fields: `id`, `opportunityId`, `contactId`, optional `role`, `createdAt`, `updatedAt`.
  - Unique on `(opportunityId, contactId)`.

- `HealthSystemOpportunity`
  - Mirror / namespace copy of `CompanyOpportunity`.
  - Important special case: `id` is not auto-generated; it reuses the `CompanyOpportunity.id`.
  - Fields mirror the company opportunity fields plus `legacyCompanyOpportunityId` (unique and generally equal to `id`).
  - Use this only as a synchronized mirror of `CompanyOpportunity`; do not treat it as the independent source of truth.

- `HealthSystemOpportunityContact`
  - Mirror of `CompanyOpportunityContact`.
  - Fields: `id`, `opportunityId`, `contactId`, optional `role`, `createdAt`, `updatedAt`.
  - Unique on `(opportunityId, contactId)`.

- `CompanyScreeningEvent`
  - Screening / webinar / session tied to a company.
  - Fields: `id`, `companyId`, `type`, `title`, optional `scheduledAt`, optional `completedAt`, optional `notes`, `createdAt`, `updatedAt`.

- `CompanyScreeningParticipant`
  - Participant or invitee for a screening event.
  - Fields: `id`, `screeningEventId`, `healthSystemId`, optional `contactId`, `attendanceStatus`, optional `notes`, `createdAt`, `updatedAt`.

- `CompanyLoi`
  - LOI status between a company and a health system.
  - Fields: `id`, `companyId`, `healthSystemId`, `status`, optional `signedAt`, optional `notes`, `statusUpdatedAt`, `createdAt`, `updatedAt`.
  - Unique on `(companyId, healthSystemId)`.

- `CompanyScreeningDocument`
  - Screening-specific document between a company and a health system.
  - Fields: `id`, `companyId`, `healthSystemId`, `title`, `url`, optional `notes`, `uploadedAt`, `createdAt`, `updatedAt`.

- `CompanyScreeningQuantitativeFeedback`
  - Structured numeric feedback from a health system and optionally a contact.
  - Fields: `id`, `companyId`, `healthSystemId`, optional `contactId`, optional `category`, `metric`, optional `score` (`Decimal(6,2)`), optional `weightPercent`, optional `notes`, `createdAt`, `updatedAt`.

- `CompanyScreeningQualitativeFeedback`
  - Freeform qualitative feedback from a health system and optionally a contact.
  - Fields: `id`, `companyId`, `healthSystemId`, optional `contactId`, optional `category`, `theme`, `sentiment`, `feedback`, `createdAt`, `updatedAt`.

- `CompanyScreeningCellChange`
  - Audit trail for screening-matrix cell edits.
  - Fields: `id`, `companyId`, `healthSystemId`, `field`, `value`, optional `changedByUserId`, optional `changedByName`, `createdAt`.

- `CompanyScreeningSurveyQuestion`
  - Reusable survey question definition.
  - Fields: `id`, `category`, `prompt`, optional `instructions`, `scaleMin`, `scaleMax`, `isActive`, `isStandard`, optional `createdByUserId`, `createdAt`, `updatedAt`.

- `CompanyScreeningSurveyTemplate`
  - Reusable survey template.
  - Fields: `id`, unique `key`, `name`, optional `description`, `isActive`, `isStandard`, optional `createdByUserId`, `createdAt`, `updatedAt`.

- `CompanyScreeningSurveyTemplateQuestion`
  - Join table placing a question inside a template.
  - Fields: `id`, `templateId`, `questionId`, `displayOrder`, optional `categoryOverride`, optional `promptOverride`, optional `instructionsOverride`, `drivesScreeningOpportunity`, `createdAt`.
  - Unique on `(templateId, questionId)`.

- `CompanyScreeningSurveySession`
  - Live survey instance for a company.
  - Fields: `id`, `companyId`, optional `templateId`, `title`, unique `accessToken`, `status`, optional `openedAt`, optional `closedAt`, optional `createdByUserId`, `createdAt`, `updatedAt`.

- `CompanyScreeningSurveySessionQuestion`
  - Materialized question inside a specific survey session.
  - Fields: `id`, `sessionId`, `questionId`, optional `templateQuestionId`, `displayOrder`, optional `categoryOverride`, optional `promptOverride`, optional `instructionsOverride`, `drivesScreeningOpportunity`, `createdAt`.
  - Unique on `(sessionId, questionId)`.

- `CompanyScreeningSurveySubmission`
  - One survey response submission.
  - Fields: `id`, `sessionId`, optional `healthSystemId`, optional `contactId`, optional `participantName`, optional `participantEmail`, `submittedAt`, optional `sourceIpHash`, optional `userAgent`.

- `CompanyScreeningSurveyAnswer`
  - One answer inside a submission.
  - Fields: `id`, `sessionId`, optional `templateId`, `submissionId`, `sessionQuestionId`, optional `templateQuestionId`, `questionId`, optional `score`, `isSkipped`, `createdAt`.
  - Unique on `(submissionId, sessionQuestionId)`.

- `CompanyFundraise`
  - Company fundraising round.
  - Fields: `id`, `companyId`, `roundLabel`, `status`, optional `totalAmountUsd`, optional `s1InvestmentUsd`, optional `announcedAt`, optional `closedAt`, optional `notes`, `createdAt`, `updatedAt`.

- `CompanyFundraiseInvestor`
  - Investor participation inside a fundraise.
  - Fields: `id`, `fundraiseId`, optional `coInvestorId`, `investorName`, optional `investmentAmountUsd`, `isLeadInvestor`, optional `notes`, `createdAt`, `updatedAt`.
  - `coInvestorId` should be filled when the investor maps to an internal `CoInvestor`.

### Contacts, users, and user-linked tables

- `Contact`
  - Core person record.
  - Required: `id`, `name`, `createdAt`, `updatedAt`.
  - Optional: `title`, `email`, `phone`, `linkedinUrl`, `notes`, optional `principalEntityType`, optional `principalEntityId`.
  - Relationships: `ContactHealthSystem`, `ContactCompany`, `ContactCoInvestor`, `CompanyOpportunityContact`, `CompanyScreeningParticipant`, screening feedback tables, survey submissions, `ContactSignalEvent`.
  - Principal entity is a nullable pointer to the contact's main affiliated organization.

- `ContactSignalEvent`
  - Machine-curated signal item tied to a contact.
  - Same shape as other signal-event tables.
  - Unique on `(contactId, dedupeKey)`.

- `ContactHealthSystem`
  - Association between a contact and health system.
  - Fields: `id`, `contactId`, `healthSystemId`, `roleType`, optional `title`, `isKeyAllianceContact`, `isInformedAllianceContact`, `createdAt`, `updatedAt`.
  - Unique on `(contactId, healthSystemId, roleType)`.

- `ContactCompany`
  - Association between a contact and company.
  - Fields: `id`, `contactId`, `companyId`, `roleType`, optional `title`, `isKeyAllianceContact`, `isInformedAllianceContact`, `createdAt`, `updatedAt`.
  - Unique on `(contactId, companyId, roleType)`.

- `ContactCoInvestor`
  - Association between a contact and co-investor.
  - Fields: `id`, `contactId`, `coInvestorId`, `roleType`, optional `title`, `isKeyAllianceContact`, `isInformedAllianceContact`, `createdAt`, `updatedAt`.
  - Unique on `(contactId, coInvestorId, roleType)`.

- `User`
  - Authenticated app user.
  - Fields: `id`, unique `email`, optional `name`, optional `image`, `isActive`, `stakeholderDigestSubscribed`, optional unique `googleSub`, optional `lastLoginAt`, `createdAt`, `updatedAt`.
  - Relationships: `UserRoleAssignment`, survey authorship tables, `CompanyReport`, `EntityNote`, `ExternalMessageCapture`.

- `UserRoleAssignment`
  - User-role join table.
  - Fields: `id`, `userId`, `role`, `createdAt`.
  - Unique on `(userId, role)`.

- `StakeholderSignalsDigestDispatch`
  - Weekly digest dispatch log.
  - Fields: `id`, unique `digestKey`, `weekStart`, `weekEnd`, `status`, `topItemsPerKind`, `subscriberCount`, `sentCount`, optional `homeUrl`, optional `summaryJson`, optional `sentAt`, optional `error`, `createdAt`, `updatedAt`.
  - Usually system-managed.

## Recommended insert/update patterns for email and transcript extraction

### 1. New company discovered

- Create or update `Company`.
- If it is being tracked in deal flow, also create or upsert `CompanyPipeline`.
- If the email/transcript ties the company to a health system, create or upsert `CompanyHealthSystemLink`.
- If it ties the company to a co-investor, create or upsert `CompanyCoInvestorLink`.
- If a human was mentioned, create or resolve a `Contact`, then create the appropriate `ContactCompany` link.
- If the transcript itself should be preserved, write an `EntityNote` on the company and optionally attach `EntityDocument` or set `googleTranscriptUrl`.

### 2. New health system discovered

- Create or update `HealthSystem`.
- Add `Executive`, `VenturePartner`, or `HealthSystemInvestment` rows only when the transcript/email clearly supports them.
- Use `ContactHealthSystem` for named people who are affiliated with that system.

### 3. New co-investor discovered

- Create or update `CoInvestor`.
- Add `CoInvestorPartner` or `CoInvestorInvestment` rows if the source supports them.
- Use `ContactCoInvestor` for named people affiliated with the fund.
- Use `CoInvestorInteraction` and `NextAction` for direct relationship-management activity, not for general factual notes.

### 4. New contact discovered

- Resolve existing `Contact` first by LinkedIn URL or email, then by name/title.
- Update sparse existing contacts by filling only missing high-confidence fields.
- Link the contact to one or more organizations via `ContactHealthSystem`, `ContactCompany`, or `ContactCoInvestor`.
- Set `principalEntityType` and `principalEntityId` when one affiliation is clearly primary.

### 5. Opportunity evidence discovered

- Create or update `CompanyOpportunity` as the source of truth.
- Mirror the same data into `HealthSystemOpportunity` with the same `id`.
- If people are involved in the opportunity, create `CompanyOpportunityContact` rows and mirror them to `HealthSystemOpportunityContact`.
- If LOI status is explicit, update `CompanyLoi`.
- If the transcript is about screening feedback, use the screening feedback tables or a company/health-system note depending on structure.

### 6. Notes, transcripts, and emails

- General narrative notes: use `EntityNote`.
- Supporting files or links: use `EntityDocument`, then attach via `EntityNoteDocument` if relevant.
- Opportunity-specific notes:
  - primary pattern is an `EntityNote` on the `COMPANY`
  - optionally propagate the same note to related `HEALTH_SYSTEM` and `CONTACT` entities
  - include `affiliations` JSON to reference the company / health system / contact / opportunity context
- Captured email:
  - create the note
  - then create `ExternalMessageCapture`
  - do not create duplicate captures for the same `(provider, externalMessageId, entityKind, entityId)`

### 7. Things to avoid

- Do not create duplicate `CompanyHealthSystemLink` or `CompanyCoInvestorLink` rows for the same logical pair.
- Do not create `HealthSystemOpportunity` without a corresponding `CompanyOpportunity`.
- Do not create `HealthSystemOpportunityContact` without the corresponding `CompanyOpportunityContact`.
- Do not write to survey tables unless you are truly recording structured screening survey sessions, submissions, and answers.
- Do not write signal-event or research-job tables for ordinary CRM note-taking.

## Short prompt you can give another AI

Use this if you want a compact version:

```text
You are proposing updates to a PostgreSQL CRM database backed by Prisma. The canonical core entities are Company, HealthSystem, CoInvestor, Contact, EntityNote, EntityDocument, CompanyPipeline, and CompanyOpportunity.

Important rules:
- Prefer updating existing records over creating duplicates.
- Contacts should be matched by LinkedIn URL, then email, then name/title.
- Companies should be matched by normalized name plus website and/or HQ location.
- CompanyOpportunity is the source of truth; mirror it to HealthSystemOpportunity with the same id.
- CompanyOpportunityContact should be mirrored to HealthSystemOpportunityContact.
- CompanyPipeline is optional in the schema but should exist for pipeline-tracked companies.
- Opportunity-specific notes are usually EntityNote rows on COMPANY, optionally propagated to related HEALTH_SYSTEM and CONTACT entities with affiliations JSON.
- Email capture should also write ExternalMessageCapture and must be idempotent on (provider, externalMessageId, entityKind, entityId).
- Treat CompanyHealthSystemLink(companyId, healthSystemId) and CompanyCoInvestorLink(companyId, coInvestorId) as logical unique pairs even though the DB does not enforce uniqueness.

Core tables:
- Company: startup/company profile, classification, lead source, research, intake status.
- CompanyPipeline: 1:1 optional pipeline workflow state for a company.
- HealthSystem: provider system profile, alliance/LP/research fields.
- CoInvestor: investor/fund profile, research fields.
- Contact: person record with optional principalEntityType/principalEntityId.
- ContactHealthSystem / ContactCompany / ContactCoInvestor: affiliation links for contacts.
- CompanyHealthSystemLink / CompanyCoInvestorLink: organization-to-organization relationship links.
- EntityNote / EntityDocument / EntityNoteDocument: shared notes and documents across company, health system, co-investor, and contact records.
- CompanyOpportunity / CompanyOpportunityContact: canonical opportunities and their contacts.
- HealthSystemOpportunity / HealthSystemOpportunityContact: mirrored namespace copies of the opportunity records.
- CompanyLoi, CompanyScreeningEvent, CompanyScreeningParticipant, CompanyScreeningDocument, CompanyScreeningQuantitativeFeedback, CompanyScreeningQualitativeFeedback, CompanyScreeningCellChange: screening and LOI workflow tables.
- CompanyFundraise / CompanyFundraiseInvestor: fundraising rounds and investors.

System-managed or less common write targets:
- research job tables
- signal event tables
- screening survey template/session/submission/answer tables
- CompanyReport
- StakeholderSignalsDigestDispatch
```
