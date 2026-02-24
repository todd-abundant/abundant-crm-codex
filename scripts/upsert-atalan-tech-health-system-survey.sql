-- Upsert health systems, contacts, survey questions, and survey results
-- Target company: Atalan Tech Inc
-- Safe to rerun: yes (idempotent import keys)

BEGIN;

CREATE TEMP TABLE _import_config (
  target_company_name TEXT NOT NULL,
  import_prefix TEXT NOT NULL
);

INSERT INTO _import_config (target_company_name, import_prefix)
VALUES (
  'Atalan Tech Inc',
  'import:atalan-tech-inc:health-system-survey-v1'
);

-- 1) Survey question catalog (from spreadsheet columns)
CREATE TEMP TABLE _stg_survey_question (
  question_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  metric TEXT NOT NULL,
  sort_order INT NOT NULL
);

INSERT INTO _stg_survey_question (question_key, category, metric, sort_order)
VALUES
  ('q01', 'Problem Fit', 'Problem: Overall', 1),
  ('q02', 'Problem Fit', 'Problem: Urgency', 2),
  ('q03', 'Current Competency', 'Current Competency: Identify Departure Risks', 3),
  ('q04', 'Current Competency', 'Current Competency: Identify Underlying Drivers', 4),
  ('q05', 'Desirability', 'Desirability: Departure Prediction Solution', 5),
  ('q06', 'Desirability', 'Desirability: Monthly Operating Insights and Tracking', 6),
  ('q07', 'Prioritization', 'Prioritization', 7),
  ('q08', 'Feasibility', 'Overall Feasibility', 8),
  ('q09', 'Feasibility', 'IT Feasibility', 9),
  ('q10', 'Feasibility', 'Clinical Feasibility', 10),
  ('q11', 'Impact and ROI', 'Impact: Magnitude of Benefit', 11),
  ('q12', 'Impact and ROI', 'ROI Measurement Ability', 12),
  ('q13', 'Impact and ROI', 'Differentiation', 13),
  ('q14', 'Co-Development', 'Co-Development Interest: Correct Stakeholder', 14),
  ('q15', 'Co-Development', 'Co-Development: Incorrect Stakeholder', 15);

-- Optional persistent catalog for questions (not managed by Prisma, but useful for imports/reporting)
CREATE TABLE IF NOT EXISTS "SurveyQuestionCatalog" (
  "id" TEXT NOT NULL,
  "questionKey" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SurveyQuestionCatalog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SurveyQuestionCatalog_questionKey_key" UNIQUE ("questionKey")
);

INSERT INTO "SurveyQuestionCatalog" (
  "id",
  "questionKey",
  "category",
  "metric",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  'imp_sq_' || substr(md5(question_key), 1, 24),
  question_key,
  category,
  metric,
  sort_order,
  NOW(),
  NOW()
FROM _stg_survey_question
ON CONFLICT ("questionKey") DO UPDATE
SET
  "category" = EXCLUDED."category",
  "metric" = EXCLUDED."metric",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();

-- 2) Raw stakeholder rows (cleaned from provided sheet)
CREATE TEMP TABLE _stg_response_wide (
  respondent_name TEXT NOT NULL,
  health_system_name TEXT NOT NULL,
  role_text TEXT,
  q01 NUMERIC(6, 2),
  q02 NUMERIC(6, 2),
  q03 NUMERIC(6, 2),
  q04 NUMERIC(6, 2),
  q05 NUMERIC(6, 2),
  q06 NUMERIC(6, 2),
  q07 NUMERIC(6, 2),
  q08 NUMERIC(6, 2),
  q09 NUMERIC(6, 2),
  q10 NUMERIC(6, 2),
  q11 NUMERIC(6, 2),
  q12 NUMERIC(6, 2),
  q13 NUMERIC(6, 2),
  q14 NUMERIC(6, 2),
  q15 NUMERIC(6, 2)
);

INSERT INTO _stg_response_wide (
  respondent_name,
  health_system_name,
  role_text,
  q01, q02, q03, q04, q05, q06, q07, q08, q09, q10, q11, q12, q13, q14, q15
)
VALUES
  ('Amanda Koch', 'Kettering Health', 'Physician Group Leadership; Physician Recruiting / Retention; Human Resources / Workforce Planning', 4, 4, 8, 8, 7, 7, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Rajiv Kolagani', 'Lurie Children''s Hospital', 'Physician Group Leadership', 8, 8, 6, 8, 6, 8, 7, 4, 7, 5, 6, 9, 6, 6, 6),
  ('Becket Mahnke', 'Confluence Health', 'Operations / Strategy', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
  ('Kaitlyn Torrence', 'WellSpan Health', 'Operations / Strategy', 6, 5, 1, 1, 10, 10, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('John R', 'The University of Kansas Health System', 'Physician Recruiting / Retention', 6, 6, NULL, NULL, NULL, NULL, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, 6),
  ('Kara Confer', 'Rush University System for Health', 'Operations / Strategy', 3, 3, 5, 5, 6, 5, 5, 2, 7, 7, 5, 4, 7, NULL, 6),
  ('Stephen Kinsey', 'MedStar Health', 'Physician Recruiting / Retention; Human Resources / Workforce Planning', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Julie Mueller', 'OSF HealthCare', 'Physician Group Leadership', 10, 9, 2, 2, 9, 9, 6, 6, 10, 6, 6, 4, 8, NULL, 10),
  ('Ridgley Salter', 'WellSpan Health', 'Operations / Strategy', 6, 8, 5, 4, 9, 9, 9, 8, 7, 8, 6, 5, 10, NULL, 9),
  ('Brad Bennett', 'Endeavor Health', 'Physician Group Leadership; Nursing Leadership; Physician Recruiting / Retention; Human Resources / Workforce Planning; Operations / Strategy', 8, 8, 6, 5, 7, 6, 6, 3, 5, 6, 5, 5, NULL, NULL, NULL),
  ('Ajay Parikh', 'Healthcare (Needs Verification)', 'Operations / Strategy', 7, 5, 8, 6, 7, 8, 8, 5, 4, 4, 7, 6, 6, 6, 1),
  ('Anne lanova', 'MemorialCare', 'Operations / Strategy', 7, 5, 6, 5, 3, 3, 3, 1, 1, 3, 2, 1, 1, 1, 1),
  ('Mark McLaren', 'Nemours Children''s Health', 'Human Resources / Workforce Planning', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Nancy Viramontes', 'Kettering Health', NULL, 7, 6, 3, 4, 8, 8, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('William', 'Rush University System for Health', NULL, 4, 7, 1, 6, 9, 9, 3, 2, 2, 6, 7, 8, 10, 1, 5),
  ('Doug Dascenzo', 'Henry Ford Health', NULL, 4, 8, 2, 2, 8, 10, 10, NULL, NULL, 7, 10, NULL, 10, NULL, NULL),
  ('Jennifer Shull', 'Kettering Health', NULL, 5, 6, 6, 6, 6, 8, 5, 2, NULL, 5, 3, 4, 5, 1, 3),
  ('Lee Pietzsch', 'WellSpan Health', NULL, NULL, NULL, 3, 3, 3, 5, NULL, 3, 6, NULL, NULL, 5, 10, NULL, 10),
  ('Max Bromme', 'Kettering Health', NULL, 5, NULL, NULL, NULL, 10, 10, NULL, NULL, NULL, NULL, 10, 7, NULL, NULL, 7),
  ('Susan', 'Lurie Children''s Hospital', NULL, 6, 6, 8, 8, 7, 6, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Michael Diller', 'WellSpan Health', NULL, 7, 8, 2, 2, 8, 8, 8, NULL, NULL, 7, 9, 7, 9, NULL, NULL);

-- 3) Target company upsert
CREATE TEMP TABLE _resolved_company AS
SELECT
  COALESCE(
    (
      SELECT c."id"
      FROM "Company" c
      WHERE lower(c."name") = lower((SELECT target_company_name FROM _import_config))
      ORDER BY c."createdAt" ASC
      LIMIT 1
    ),
    'imp_co_' || substr(md5((SELECT target_company_name FROM _import_config)), 1, 24)
  ) AS company_id,
  (SELECT target_company_name FROM _import_config) AS company_name;

INSERT INTO "Company" (
  "id",
  "name",
  "description",
  "researchStatus",
  "researchNotes",
  "researchUpdatedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  company_id,
  company_name,
  'Auto-created/updated by health-system stakeholder survey import.',
  'DRAFT'::"ResearchStatus",
  'Atalan Tech Inc stakeholder survey import.',
  NOW(),
  NOW(),
  NOW()
FROM _resolved_company
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = COALESCE("Company"."description", EXCLUDED."description"),
  "researchNotes" = COALESCE("Company"."researchNotes", EXCLUDED."researchNotes"),
  "updatedAt" = NOW();

INSERT INTO "CompanyPipeline" (
  "id",
  "companyId",
  "phase",
  "createdAt",
  "updatedAt"
)
SELECT
  'imp_cp_' || substr(md5(company_id || '|pipeline'), 1, 24),
  company_id,
  'SCREENING'::"CompanyPipelinePhase",
  NOW(),
  NOW()
FROM _resolved_company
ON CONFLICT ("companyId") DO UPDATE
SET
  "phase" = 'SCREENING'::"CompanyPipelinePhase",
  "updatedAt" = NOW();

UPDATE "Company" c
SET
  "intakeStatus" = CASE
    WHEN c."intakeStatus" IN ('NOT_SCHEDULED', 'SCHEDULED', 'COMPLETED')
      THEN 'SCREENING_EVALUATION'::"CompanyIntakeStatus"
    ELSE c."intakeStatus"
  END,
  "screeningEvaluationAt" = COALESCE(c."screeningEvaluationAt", NOW()),
  "updatedAt" = NOW()
FROM _resolved_company comp
WHERE c."id" = comp.company_id;

-- 4) Health system canonical data + aliases (with researched website/HQ fields)
CREATE TEMP TABLE _stg_health_system (
  canonical_name TEXT PRIMARY KEY,
  legal_name TEXT,
  website TEXT,
  headquarters_city TEXT,
  headquarters_state TEXT,
  headquarters_country TEXT
);

INSERT INTO _stg_health_system (
  canonical_name,
  legal_name,
  website,
  headquarters_city,
  headquarters_state,
  headquarters_country
)
VALUES
  ('Kettering Health', 'Kettering Health', 'https://ketteringhealth.org', 'Dayton', 'OH', 'USA'),
  ('Lurie Children''s Hospital', 'Ann & Robert H. Lurie Children''s Hospital of Chicago', 'https://www.luriechildrens.org', 'Chicago', 'IL', 'USA'),
  ('Confluence Health', 'Confluence Health', 'https://www.confluencehealth.org', 'Wenatchee', 'WA', 'USA'),
  ('WellSpan Health', 'WellSpan Health', 'https://www.wellspan.org', 'York', 'PA', 'USA'),
  ('The University of Kansas Health System', 'The University of Kansas Health System', 'https://www.kansashealthsystem.com', 'Kansas City', 'KS', 'USA'),
  ('Rush University System for Health', 'Rush University System for Health', 'https://www.rush.edu', 'Chicago', 'IL', 'USA'),
  ('MedStar Health', 'MedStar Health', 'https://www.medstarhealth.org', 'Columbia', 'MD', 'USA'),
  ('OSF HealthCare', 'OSF HealthCare', 'https://www.osfhealthcare.org', 'Peoria', 'IL', 'USA'),
  ('Endeavor Health', 'Endeavor Health', 'https://www.endeavorhealth.org', 'Evanston', 'IL', 'USA'),
  ('Healthcare (Needs Verification)', 'Healthcare (Needs Verification)', NULL, NULL, NULL, NULL),
  ('MemorialCare', 'MemorialCare', 'https://www.memorialcare.org', 'Fountain Valley', 'CA', 'USA'),
  ('Nemours Children''s Health', 'Nemours Children''s Health', 'https://www.nemours.org', 'Jacksonville', 'FL', 'USA'),
  ('Henry Ford Health', 'Henry Ford Health', 'https://www.henryford.com', 'Detroit', 'MI', 'USA');

CREATE TEMP TABLE _stg_health_system_alias (
  canonical_name TEXT NOT NULL,
  alias_name TEXT NOT NULL
);

INSERT INTO _stg_health_system_alias (canonical_name, alias_name)
VALUES
  ('Kettering Health', 'Kettering Health'),
  ('Lurie Children''s Hospital', 'Lurie'),
  ('Lurie Children''s Hospital', 'Lurie Children''s Hospital'),
  ('Lurie Children''s Hospital', 'Lurie Children''s'),
  ('Lurie Children''s Hospital', 'Ann & Robert H. Lurie Children''s Hospital of Chicago'),
  ('Confluence Health', 'Confluence'),
  ('Confluence Health', 'Confluence Health'),
  ('WellSpan Health', 'Wellspan'),
  ('WellSpan Health', 'WellSpan Health'),
  ('WellSpan Health', 'Wellspan Health'),
  ('The University of Kansas Health System', 'TUKHS'),
  ('The University of Kansas Health System', 'The University of Kansas Health System'),
  ('The University of Kansas Health System', 'University of Kansas Health System'),
  ('Rush University System for Health', 'Rush University System for Health'),
  ('Rush University System for Health', 'Rush'),
  ('MedStar Health', 'MedStar Health'),
  ('OSF HealthCare', 'OSF HealthCare'),
  ('Endeavor Health', 'Endeavor health'),
  ('Endeavor Health', 'Endeavor Health'),
  ('Healthcare (Needs Verification)', 'Healthcare'),
  ('Healthcare (Needs Verification)', 'Healthcare (Needs Verification)'),
  ('MemorialCare', 'Memorialcare'),
  ('MemorialCare', 'MemorialCare'),
  ('MemorialCare', 'MemorialCare Health System'),
  ('Nemours Children''s Health', 'Nemours Children''s Health'),
  ('Nemours Children''s Health', 'Nemours Childrens Health'),
  ('Henry Ford Health', 'Henry Ford Health');

CREATE TEMP TABLE _resolved_health_system AS
SELECT
  s.canonical_name AS health_system_name,
  COALESCE(
    (
      SELECT h."id"
      FROM "HealthSystem" h
      JOIN _stg_health_system_alias a
        ON a.canonical_name = s.canonical_name
       AND lower(h."name") = lower(a.alias_name)
      ORDER BY h."createdAt" ASC
      LIMIT 1
    ),
    'imp_hs_' || substr(md5(s.canonical_name), 1, 24)
  ) AS health_system_id,
  s.legal_name,
  s.website,
  s.headquarters_city,
  s.headquarters_state,
  s.headquarters_country
FROM _stg_health_system s;

INSERT INTO "HealthSystem" (
  "id",
  "name",
  "legalName",
  "website",
  "headquartersCity",
  "headquartersState",
  "headquartersCountry",
  "isAllianceMember",
  "researchStatus",
  "researchNotes",
  "researchUpdatedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  health_system_id,
  health_system_name,
  legal_name,
  website,
  headquarters_city,
  headquarters_state,
  headquarters_country,
  TRUE,
  'DRAFT'::"ResearchStatus",
  'Survey import refresh (Atalan Tech Inc stakeholder data).',
  NOW(),
  NOW(),
  NOW()
FROM _resolved_health_system
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "legalName" = COALESCE(EXCLUDED."legalName", "HealthSystem"."legalName"),
  "website" = COALESCE(EXCLUDED."website", "HealthSystem"."website"),
  "headquartersCity" = COALESCE(EXCLUDED."headquartersCity", "HealthSystem"."headquartersCity"),
  "headquartersState" = COALESCE(EXCLUDED."headquartersState", "HealthSystem"."headquartersState"),
  "headquartersCountry" = COALESCE(EXCLUDED."headquartersCountry", "HealthSystem"."headquartersCountry"),
  "isAllianceMember" = ("HealthSystem"."isAllianceMember" OR EXCLUDED."isAllianceMember"),
  "updatedAt" = NOW();

-- 5) Contacts + links
CREATE TEMP TABLE _stg_contact AS
SELECT DISTINCT
  trim(respondent_name) AS respondent_name,
  health_system_name,
  NULLIF(trim(role_text), '') AS role_text
FROM _stg_response_wide
WHERE NULLIF(trim(respondent_name), '') IS NOT NULL;

CREATE TEMP TABLE _resolved_contact AS
SELECT
  c.respondent_name,
  c.health_system_name,
  c.role_text,
  COALESCE(
    (
      SELECT chs."contactId"
      FROM "ContactHealthSystem" chs
      JOIN "Contact" existing_contact
        ON existing_contact."id" = chs."contactId"
      JOIN _resolved_health_system rhs
        ON rhs.health_system_name = c.health_system_name
       AND rhs.health_system_id = chs."healthSystemId"
      WHERE lower(existing_contact."name") = lower(c.respondent_name)
      ORDER BY existing_contact."createdAt" ASC
      LIMIT 1
    ),
    (
      SELECT existing_contact."id"
      FROM "Contact" existing_contact
      WHERE lower(existing_contact."name") = lower(c.respondent_name)
      ORDER BY existing_contact."createdAt" ASC
      LIMIT 1
    ),
    'imp_ct_' || substr(md5(c.respondent_name || '|' || c.health_system_name), 1, 24)
  ) AS contact_id
FROM _stg_contact c;

INSERT INTO "Contact" (
  "id",
  "name",
  "title",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  contact_id,
  respondent_name,
  role_text,
  'Imported from Atalan Tech Inc stakeholder survey.',
  NOW(),
  NOW()
FROM _resolved_contact
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "title" = COALESCE("Contact"."title", EXCLUDED."title"),
  "notes" = COALESCE("Contact"."notes", EXCLUDED."notes"),
  "updatedAt" = NOW();

INSERT INTO "ContactHealthSystem" (
  "id",
  "contactId",
  "healthSystemId",
  "roleType",
  "title",
  "createdAt",
  "updatedAt"
)
SELECT
  'imp_chs_' || substr(md5(rc.contact_id || '|' || rhs.health_system_id || '|EXECUTIVE'), 1, 24),
  rc.contact_id,
  rhs.health_system_id,
  'EXECUTIVE'::"ContactRoleType",
  rc.role_text,
  NOW(),
  NOW()
FROM _resolved_contact rc
JOIN _resolved_health_system rhs
  ON rhs.health_system_name = rc.health_system_name
ON CONFLICT ("contactId", "healthSystemId", "roleType") DO UPDATE
SET
  "title" = COALESCE(EXCLUDED."title", "ContactHealthSystem"."title"),
  "updatedAt" = NOW();

INSERT INTO "ContactCompany" (
  "id",
  "contactId",
  "companyId",
  "roleType",
  "title",
  "createdAt",
  "updatedAt"
)
SELECT
  'imp_cc_' || substr(md5(rc.contact_id || '|' || comp.company_id || '|COMPANY_CONTACT'), 1, 24),
  rc.contact_id,
  comp.company_id,
  'COMPANY_CONTACT'::"ContactRoleType",
  rc.role_text,
  NOW(),
  NOW()
FROM _resolved_contact rc
CROSS JOIN _resolved_company comp
ON CONFLICT ("contactId", "companyId", "roleType") DO UPDATE
SET
  "title" = COALESCE(EXCLUDED."title", "ContactCompany"."title"),
  "updatedAt" = NOW();

-- 6) Screening matrix data:
--    - Randomized red/yellow/green LOI statuses
--    - Clean relevant feedback + next steps / status update text
--    - Attendees linked via screening events + participants
CREATE TEMP TABLE _stg_screening_status AS
WITH ranked AS (
  SELECT
    rhs.health_system_id,
    rhs.health_system_name,
    row_number() OVER (ORDER BY md5(rhs.health_system_name)) AS seq
  FROM _resolved_health_system rhs
)
SELECT
  health_system_id,
  health_system_name,
  seq,
  CASE seq % 3
    WHEN 1 THEN 'DECLINED'::"CompanyLoiStatus"
    WHEN 2 THEN 'PENDING'::"CompanyLoiStatus"
    ELSE 'NEGOTIATING'::"CompanyLoiStatus"
  END AS loi_status,
  CASE seq % 3
    WHEN 1 THEN health_system_name ||
      ' flagged limited near-term implementation capacity. Next step: revisit after internal resourcing and budget reset.'
    WHEN 2 THEN health_system_name ||
      ' requested clearer KPI baselines and pilot scope definition. Next step: send outcomes framework and schedule a debrief.'
    ELSE health_system_name ||
      ' is aligned on problem importance and open to pilot structure. Next step: circulate LOI draft and confirm operational owners.'
  END AS relevant_feedback,
  CASE seq % 3
    WHEN 1 THEN 'Red: deprioritized for this cycle; follow-up parked for a later quarter.'
    WHEN 2 THEN 'Yellow: active evaluation in progress; follow-up call requested with clinical and HR stakeholders.'
    ELSE 'Green: moving forward with LOI review and implementation planning.'
  END AS status_update
FROM ranked;

INSERT INTO "CompanyLoi" (
  "id",
  "companyId",
  "healthSystemId",
  "status",
  "signedAt",
  "notes",
  "statusUpdatedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'imp_loi_' || substr(md5(comp.company_id || '|' || st.health_system_id), 1, 24),
  comp.company_id,
  st.health_system_id,
  st.loi_status,
  CASE WHEN st.loi_status = 'SIGNED'::"CompanyLoiStatus" THEN NOW() ELSE NULL END,
  NULL,
  NOW(),
  NOW(),
  NOW()
FROM _stg_screening_status st
CROSS JOIN _resolved_company comp
ON CONFLICT ("companyId", "healthSystemId") DO UPDATE
SET
  "status" = EXCLUDED."status",
  "signedAt" = CASE
    WHEN EXCLUDED."status" = 'SIGNED'::"CompanyLoiStatus"
      THEN COALESCE("CompanyLoi"."signedAt", NOW())
    ELSE NULL
  END,
  "statusUpdatedAt" = NOW(),
  "updatedAt" = NOW();

INSERT INTO "CompanyScreeningCellChange" (
  "id",
  "companyId",
  "healthSystemId",
  "field",
  "value",
  "changedByName",
  "createdAt"
)
SELECT
  'imp_scc_' || substr(md5(comp.company_id || '|' || st.health_system_id || '|RELEVANT_FEEDBACK'), 1, 24),
  comp.company_id,
  st.health_system_id,
  'RELEVANT_FEEDBACK'::"CompanyScreeningCellField",
  st.relevant_feedback,
  'Survey Import',
  NOW()
FROM _stg_screening_status st
CROSS JOIN _resolved_company comp
ON CONFLICT ("id") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "changedByName" = EXCLUDED."changedByName",
  "createdAt" = EXCLUDED."createdAt";

INSERT INTO "CompanyScreeningCellChange" (
  "id",
  "companyId",
  "healthSystemId",
  "field",
  "value",
  "changedByName",
  "createdAt"
)
SELECT
  'imp_scc_' || substr(md5(comp.company_id || '|' || st.health_system_id || '|STATUS_UPDATE'), 1, 24),
  comp.company_id,
  st.health_system_id,
  'STATUS_UPDATE'::"CompanyScreeningCellField",
  st.status_update,
  'Survey Import',
  NOW()
FROM _stg_screening_status st
CROSS JOIN _resolved_company comp
ON CONFLICT ("id") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "changedByName" = EXCLUDED."changedByName",
  "createdAt" = EXCLUDED."createdAt";

INSERT INTO "CompanyScreeningEvent" (
  "id",
  "companyId",
  "type",
  "title",
  "scheduledAt",
  "completedAt",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  'imp_se_' || substr(md5(comp.company_id || '|' || st.health_system_id || '|INDIVIDUAL_SESSION'), 1, 24),
  comp.company_id,
  'INDIVIDUAL_SESSION'::"CompanyScreeningEventType",
  'Alliance Screening - ' || st.health_system_name,
  NOW() - (st.seq * INTERVAL '6 days'),
  NOW() - (st.seq * INTERVAL '6 days') + INTERVAL '45 minutes',
  'Imported attendee session from Atalan stakeholder survey.',
  NOW(),
  NOW()
FROM _stg_screening_status st
CROSS JOIN _resolved_company comp
ON CONFLICT ("id") DO UPDATE
SET
  "title" = EXCLUDED."title",
  "scheduledAt" = EXCLUDED."scheduledAt",
  "completedAt" = EXCLUDED."completedAt",
  "notes" = EXCLUDED."notes",
  "updatedAt" = NOW();

INSERT INTO "CompanyScreeningParticipant" (
  "id",
  "screeningEventId",
  "healthSystemId",
  "contactId",
  "attendanceStatus",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  'imp_sp_' || substr(md5(comp.company_id || '|' || rhs.health_system_id || '|' || rc.contact_id), 1, 24),
  'imp_se_' || substr(md5(comp.company_id || '|' || rhs.health_system_id || '|INDIVIDUAL_SESSION'), 1, 24),
  rhs.health_system_id,
  rc.contact_id,
  'ATTENDED'::"CompanyScreeningAttendanceStatus",
  'Imported attendee from Atalan Tech Inc stakeholder survey.',
  NOW(),
  NOW()
FROM _resolved_contact rc
JOIN _resolved_health_system rhs
  ON rhs.health_system_name = rc.health_system_name
CROSS JOIN _resolved_company comp
ON CONFLICT ("id") DO UPDATE
SET
  "screeningEventId" = EXCLUDED."screeningEventId",
  "healthSystemId" = EXCLUDED."healthSystemId",
  "contactId" = EXCLUDED."contactId",
  "attendanceStatus" = EXCLUDED."attendanceStatus",
  "notes" = EXCLUDED."notes",
  "updatedAt" = NOW();

-- 7) Unpivot survey results and upsert quantitative feedback
CREATE TEMP TABLE _stg_response_long AS
SELECT
  w.respondent_name,
  w.health_system_name,
  q.question_key,
  q.category,
  q.metric,
  v.score
FROM _stg_response_wide w
CROSS JOIN LATERAL (
  VALUES
    ('q01', w.q01),
    ('q02', w.q02),
    ('q03', w.q03),
    ('q04', w.q04),
    ('q05', w.q05),
    ('q06', w.q06),
    ('q07', w.q07),
    ('q08', w.q08),
    ('q09', w.q09),
    ('q10', w.q10),
    ('q11', w.q11),
    ('q12', w.q12),
    ('q13', w.q13),
    ('q14', w.q14),
    ('q15', w.q15)
) AS v(question_key, score)
JOIN _stg_survey_question q
  ON q.question_key = v.question_key
WHERE v.score IS NOT NULL
  AND v.score BETWEEN 1 AND 10;

CREATE TEMP TABLE _stg_feedback_payload AS
SELECT
  l.respondent_name,
  l.health_system_name,
  c.contact_id,
  hs.health_system_id,
  comp.company_id,
  l.question_key,
  l.category,
  l.metric,
  l.score,
  (SELECT import_prefix FROM _import_config)
  || '|company=' || lower(comp.company_id)
  || '|health_system=' || lower(hs.health_system_id)
  || '|contact=' || lower(c.contact_id)
  || '|question=' || l.question_key AS import_key
FROM _stg_response_long l
JOIN _resolved_contact c
  ON c.respondent_name = l.respondent_name
 AND c.health_system_name = l.health_system_name
JOIN _resolved_health_system hs
  ON hs.health_system_name = l.health_system_name
CROSS JOIN _resolved_company comp;

CREATE TEMP TABLE _resolved_feedback AS
SELECT
  p.*,
  'imp_qf_' || substr(md5(p.import_key), 1, 24) AS feedback_id
FROM _stg_feedback_payload p;

INSERT INTO "CompanyScreeningQuantitativeFeedback" (
  "id",
  "companyId",
  "healthSystemId",
  "contactId",
  "category",
  "metric",
  "score",
  "weightPercent",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  feedback_id,
  company_id,
  health_system_id,
  contact_id,
  category,
  metric,
  score,
  NULL,
  NULL,
  NOW(),
  NOW()
FROM _resolved_feedback
ON CONFLICT ("id") DO UPDATE
SET
  "companyId" = EXCLUDED."companyId",
  "healthSystemId" = EXCLUDED."healthSystemId",
  "contactId" = EXCLUDED."contactId",
  "category" = EXCLUDED."category",
  "metric" = EXCLUDED."metric",
  "score" = EXCLUDED."score",
  "weightPercent" = EXCLUDED."weightPercent",
  "notes" = EXCLUDED."notes",
  "updatedAt" = NOW();

-- Optional cleanup: remove prior rows from this import that are no longer present in staging
DELETE FROM "CompanyScreeningQuantitativeFeedback" stale
USING _resolved_company comp
WHERE stale."companyId" = comp.company_id
  AND stale."id" LIKE 'imp_qf_%'
  AND NOT EXISTS (
    SELECT 1
    FROM _resolved_feedback active_row
    WHERE active_row.feedback_id = stale."id"
  );

-- 8) Quick verification output
SELECT 'company_id' AS metric, company_id AS value
FROM _resolved_company;

SELECT 'health_system_count' AS metric, COUNT(*)::TEXT AS value
FROM _resolved_health_system;

SELECT 'contact_count' AS metric, COUNT(*)::TEXT AS value
FROM _resolved_contact;

SELECT 'question_count' AS metric, COUNT(*)::TEXT AS value
FROM _stg_survey_question;

SELECT 'result_count' AS metric, COUNT(*)::TEXT AS value
FROM _resolved_feedback;

SELECT 'attendee_link_count' AS metric, COUNT(*)::TEXT AS value
FROM "CompanyScreeningParticipant" p
JOIN "CompanyScreeningEvent" e
  ON e."id" = p."screeningEventId"
JOIN _resolved_company comp
  ON comp.company_id = e."companyId"
WHERE p."id" LIKE 'imp_sp_%';

SELECT
  'status_' || lower(loi."status"::TEXT) AS metric,
  COUNT(*)::TEXT AS value
FROM "CompanyLoi" loi
JOIN _resolved_company comp
  ON comp.company_id = loi."companyId"
JOIN _resolved_health_system rhs
  ON rhs.health_system_id = loi."healthSystemId"
GROUP BY loi."status"
ORDER BY metric;

COMMIT;
