-- Upsert Project Kina company + intake data from local to production
-- Safe to rerun: yes

BEGIN;

CREATE TEMP TABLE _src_company (
  source_company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  website TEXT,
  headquarters_city TEXT,
  headquarters_state TEXT,
  headquarters_country TEXT,
  company_type "CompanyType" NOT NULL,
  primary_category "CompanyPrimaryCategory" NOT NULL,
  primary_category_other TEXT,
  decline_reason "CompanyDeclineReason",
  decline_reason_other TEXT,
  lead_source_type "CompanyLeadSourceType" NOT NULL,
  lead_source_health_system_id TEXT,
  lead_source_other TEXT,
  lead_source_notes TEXT,
  description TEXT,
  at_a_glance_problem TEXT,
  at_a_glance_solution TEXT,
  at_a_glance_impact TEXT,
  at_a_glance_key_strengths TEXT,
  at_a_glance_key_considerations TEXT,
  google_transcript_url TEXT,
  spin_out_ownership_percent NUMERIC(7,2),
  intake_status "CompanyIntakeStatus" NOT NULL,
  intake_scheduled_at TIMESTAMP,
  screening_evaluation_at TIMESTAMP,
  research_status "ResearchStatus" NOT NULL,
  research_notes TEXT,
  research_error TEXT,
  research_updated_at TIMESTAMP,
  source_created_at TIMESTAMP NOT NULL,
  source_updated_at TIMESTAMP NOT NULL
);

INSERT INTO _src_company VALUES (
  'cmmc8dfcn00012ml1r4tpgd46',
  'Project Kina',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'DENOVO'::"CompanyType",
  'PROVIDER_EXPERIENCE_AND_DEVELOPMENT'::"CompanyPrimaryCategory",
  NULL,
  NULL,
  NULL,
  'OTHER'::"CompanyLeadSourceType",
  NULL,
  'Eric Langshur',
  NULL,
  '<p><span style="background-color: transparent; color: rgb(27, 58, 99);">Project&nbsp;Kina&nbsp;is&nbsp;a&nbsp;patient&nbsp;and&nbsp;workforce&nbsp;experience&nbsp;intelligence&nbsp;platform&nbsp;designed&nbsp;to&nbsp;replace&nbsp;survey&nbsp;vendors&nbsp;to&nbsp;provide&nbsp;actionable&nbsp;insight.&nbsp;Beyond&nbsp;standard&nbsp;surveys&nbsp;Project&nbsp;Kina&nbsp;could&nbsp;also&nbsp;build&nbsp;for&nbsp;the&nbsp;modern&nbsp;health&nbsp;system&nbsp;by&nbsp;capturing&nbsp;feedback&nbsp;at&nbsp;the&nbsp;point&nbsp;of&nbsp;care&nbsp;via&nbsp;new&nbsp;digital&nbsp;data&nbsp;sources&nbsp;and&nbsp;tools&nbsp;(e.g.&nbsp;ambient&nbsp;listening,&nbsp;sentiment&nbsp;analysis,&nbsp;AI&nbsp;workflow&nbsp;orchestration).&nbsp;Unlike&nbsp;legacy&nbsp;survey&nbsp;vendors,&nbsp;Project&nbsp;Kina&nbsp;unifies&nbsp;experience,&nbsp;safety,&nbsp;and&nbsp;workforce&nbsp;signals&nbsp;into&nbsp;an&nbsp;affordable&nbsp;solution&nbsp;that&nbsp;can&nbsp;orchestrate&nbsp;immediate&nbsp;follow&nbsp;up&nbsp;—&nbsp;giving&nbsp;leaders&nbsp;and&nbsp;managers&nbsp;a&nbsp;live&nbsp;opportunity&nbsp;to&nbsp;impact&nbsp;performance&nbsp;across&nbsp;units,&nbsp;service&nbsp;lines,&nbsp;and&nbsp;roles.&nbsp;It&nbsp;initially&nbsp;replaces&nbsp;required&nbsp;survey&nbsp;programs&nbsp;(e.g.&nbsp;CMS&nbsp;HCAHPS)&nbsp;and&nbsp;enables&nbsp;more&nbsp;modern,&nbsp;real-time&nbsp;functions&nbsp;as&nbsp;available&nbsp;to&nbsp;modernize&nbsp;the&nbsp;potential&nbsp;for&nbsp;outcomes.&nbsp;&nbsp;Example&nbsp;audiences&nbsp;for&nbsp;Project&nbsp;Kina&nbsp;include:</span></p><ul><li><span style="background-color: transparent; color: rgb(27, 58, 99);">Health&nbsp;System&nbsp;Executives&nbsp;(COO,&nbsp;CNO,&nbsp;Chief&nbsp;Experience&nbsp;Officer,&nbsp;CQO)</span></li><li><span style="background-color: transparent; color: rgb(27, 58, 99);">Workforce&nbsp;and&nbsp;HR&nbsp;Teams</span></li><li><span style="background-color: transparent; color: rgb(27, 58, 99);">Frontline&nbsp;Operational&nbsp;Managers</span></li></ul><p></p>',
  '<p>Health&nbsp;systems&nbsp;spend&nbsp;millions&nbsp;annually&nbsp;with&nbsp;legacy&nbsp;vendors&nbsp;like&nbsp;Press&nbsp;Ganey&nbsp;to&nbsp;measure&nbsp;patient&nbsp;and&nbsp;workforce&nbsp;experience,&nbsp;yet&nbsp;these&nbsp;tools&nbsp;are&nbsp;outdated,&nbsp;slow,&nbsp;and&nbsp;disconnected&nbsp;from&nbsp;real&nbsp;operations.&nbsp;The&nbsp;result&nbsp;is&nbsp;mounting&nbsp;executive&nbsp;frustration&nbsp;from&nbsp;high&nbsp;cost,&nbsp;low&nbsp;usability,&nbsp;and&nbsp;little&nbsp;measurable&nbsp;impact&nbsp;on&nbsp;outcomes&nbsp;or&nbsp;performance.&nbsp;Health&nbsp;systems&nbsp;spend&nbsp;millions&nbsp;annually&nbsp;with&nbsp;these&nbsp;legacy&nbsp;vendors&nbsp;that&nbsp;experience&nbsp;notable&nbsp;profit&nbsp;margins.&nbsp;&nbsp;Press&nbsp;Ganey&nbsp;recently&nbsp;announced&nbsp;intent&nbsp;to&nbsp;sell&nbsp;to&nbsp;Qualtrics&nbsp;for&nbsp;$6.75B.&nbsp;&nbsp;Assuming&nbsp;investors&nbsp;will&nbsp;expect&nbsp;return&nbsp;on&nbsp;this&nbsp;investment,&nbsp;it&nbsp;only&nbsp;means&nbsp;higher&nbsp;prices&nbsp;on&nbsp;the&nbsp;backs&nbsp;of&nbsp;providers.</p>',
  '<p>Project&nbsp;Kina&nbsp;is&nbsp;a&nbsp;patient&nbsp;and&nbsp;workforce&nbsp;experience&nbsp;intelligence&nbsp;platform&nbsp;designed&nbsp;to&nbsp;replace&nbsp;survey&nbsp;vendors&nbsp;to&nbsp;provide&nbsp;actionable&nbsp;insight.&nbsp;Beyond&nbsp;standard&nbsp;surveys&nbsp;Project&nbsp;Kina&nbsp;could&nbsp;also&nbsp;build&nbsp;for&nbsp;the&nbsp;modern&nbsp;health&nbsp;system&nbsp;by&nbsp;capturing&nbsp;feedback&nbsp;at&nbsp;the&nbsp;point&nbsp;of&nbsp;care&nbsp;via&nbsp;new&nbsp;digital&nbsp;data&nbsp;sources&nbsp;and&nbsp;tools&nbsp;(e.g.&nbsp;ambient&nbsp;listening,&nbsp;sentiment&nbsp;analysis,&nbsp;AI&nbsp;workflow&nbsp;orchestration).&nbsp;Unlike&nbsp;legacy&nbsp;survey&nbsp;vendors,&nbsp;Project&nbsp;Kina&nbsp;unifies&nbsp;experience,&nbsp;safety,&nbsp;and&nbsp;workforce&nbsp;signals&nbsp;into&nbsp;an&nbsp;affordable&nbsp;solution&nbsp;that&nbsp;can&nbsp;orchestrate&nbsp;immediate&nbsp;follow&nbsp;up&nbsp;—&nbsp;giving&nbsp;leaders&nbsp;and&nbsp;managers&nbsp;a&nbsp;live&nbsp;opportunity&nbsp;to&nbsp;impact&nbsp;performance&nbsp;across&nbsp;units,&nbsp;service&nbsp;lines,&nbsp;and&nbsp;roles.&nbsp;It&nbsp;initially&nbsp;replaces&nbsp;required&nbsp;survey&nbsp;programs&nbsp;(e.g.&nbsp;CMS&nbsp;HCAHPS)&nbsp;and&nbsp;enables&nbsp;more&nbsp;modern,&nbsp;real-time&nbsp;functions&nbsp;as&nbsp;available&nbsp;to&nbsp;modernize&nbsp;the&nbsp;potential&nbsp;for&nbsp;outcomes.&nbsp;&nbsp;Example&nbsp;audiences&nbsp;for&nbsp;Project&nbsp;Kina&nbsp;include:</p><ul><li>Health&nbsp;System&nbsp;Executives&nbsp;(COO,&nbsp;CNO,&nbsp;Chief&nbsp;Experience&nbsp;Officer,&nbsp;CQO)</li><li>Workforce&nbsp;and&nbsp;HR&nbsp;Teams</li><li>Frontline&nbsp;Operational&nbsp;Managers</li></ul>',
  '<p>Project&nbsp;Kina&nbsp;is&nbsp;a&nbsp;concept-stage&nbsp;venture&nbsp;seeking&nbsp;design&nbsp;and&nbsp;pilot&nbsp;partners&nbsp;to&nbsp;validate&nbsp;early&nbsp;prototypes&nbsp;within&nbsp;one&nbsp;or&nbsp;more&nbsp;health&nbsp;systems.&nbsp;The&nbsp;platform&nbsp;aims&nbsp;to&nbsp;deliver&nbsp;measurable&nbsp;improvement&nbsp;in&nbsp;the&nbsp;cost&nbsp;of&nbsp;capturing&nbsp;patient&nbsp;experience&nbsp;and&nbsp;staff&nbsp;engagement&nbsp;metrics&nbsp;—&nbsp;while&nbsp;continuously&nbsp;reducing&nbsp;administrative&nbsp;burden.&nbsp;Over&nbsp;time,&nbsp;Project&nbsp;Kina&nbsp;could&nbsp;redefine&nbsp;how&nbsp;health&nbsp;systems&nbsp;measure,&nbsp;manage,&nbsp;and&nbsp;act&nbsp;on&nbsp;experience&nbsp;by&nbsp;turning&nbsp;feedback&nbsp;into&nbsp;an&nbsp;operational&nbsp;advantage.</p><p></p>',
  '<ul><li><strong>Market&nbsp;Dissatisfaction.&nbsp;</strong>Press&nbsp;Ganey/Qualtrics&nbsp;has&nbsp;deep&nbsp;market&nbsp;penetration&nbsp;but&nbsp;widespread&nbsp;frustration.&nbsp;&nbsp;Executives&nbsp;complain&nbsp;about&nbsp;outdated&nbsp;tech,&nbsp;high&nbsp;prices,&nbsp;and&nbsp;weak&nbsp;innovation.&nbsp;&nbsp;Health&nbsp;system&nbsp;leaders&nbsp;are&nbsp;actively&nbsp;looking&nbsp;for&nbsp;modern&nbsp;alternatives&nbsp;that&nbsp;are&nbsp;real-time&nbsp;and&nbsp;operational&nbsp;relevant;&nbsp;as&nbsp;well&nbsp;as&nbsp;save&nbsp;on&nbsp;operating&nbsp;costs.</li><li><strong>Market&nbsp;Timing.&nbsp;</strong>The&nbsp;sale&nbsp;of&nbsp;Press&nbsp;Ganey&nbsp;to&nbsp;Qualtrics&nbsp;provides&nbsp;an&nbsp;interesting&nbsp;opportunity&nbsp;for&nbsp;health&nbsp;systems&nbsp;to&nbsp;re-evaluate&nbsp;the&nbsp;risk/benefit&nbsp;of&nbsp;switching&nbsp;costs.&nbsp;AI&nbsp;ambient&nbsp;listening&nbsp;and&nbsp;analytics&nbsp;maturity,&nbsp;and&nbsp;C-Suite&nbsp;focus&nbsp;on&nbsp;consumerism&nbsp;and&nbsp;workforce&nbsp;burnout&nbsp;make&nbsp;2025&nbsp;-&nbsp;2027&nbsp;a&nbsp;prime&nbsp;window&nbsp;for&nbsp;innovation.</li><li><strong>Category&nbsp;Redefinition.&nbsp;&nbsp;</strong>The&nbsp;winning&nbsp;play&nbsp;might&nbsp;be&nbsp;on&nbsp;a&nbsp;lower&nbsp;cost/margin&nbsp;alternative&nbsp;owned&nbsp;by&nbsp;health&nbsp;systems&nbsp;as&nbsp;a&nbsp;scalable&nbsp;wedge.&nbsp;</li></ul>',
  '<ul><li><strong>Structural&nbsp;Entrenchment.</strong>&nbsp;Press&nbsp;Ganey/Qualtrics&nbsp;is&nbsp;baked&nbsp;into&nbsp;CMS&nbsp;compliance.&nbsp;&nbsp;Project&nbsp;Kina&nbsp;would&nbsp;spend&nbsp;18&nbsp;-&nbsp;36&nbsp;months&nbsp;becoming&nbsp;CMS&nbsp;approved&nbsp;or&nbsp;run&nbsp;as&nbsp;a&nbsp;parallel,&nbsp;which&nbsp;can&nbsp;limit&nbsp;its&nbsp;revenue&nbsp;and&nbsp;influence.</li><li><strong>Switching&nbsp;Friction.&nbsp;</strong>&nbsp;Operational&nbsp;lift&nbsp;to&nbsp;replace&nbsp;Press&nbsp;Ganey/Qualtrics&nbsp;is&nbsp;significant.&nbsp;&nbsp;Even&nbsp;unhappy&nbsp;customers&nbsp;may&nbsp;delay&nbsp;change&nbsp;due&nbsp;to&nbsp;bandwidth.&nbsp;Existing&nbsp;Press&nbsp;Ganey/Qualtrics&nbsp;customers&nbsp;are&nbsp;typically&nbsp;locked&nbsp;into&nbsp;3&nbsp;-&nbsp;5&nbsp;year&nbsp;contracts.&nbsp;&nbsp;While&nbsp;theoretical&nbsp;TAM&nbsp;might&nbsp;be&nbsp;&gt;$3B,&nbsp;the&nbsp;realistic&nbsp;switching&nbsp;TAM&nbsp;for&nbsp;next&nbsp;2-3&nbsp;years&nbsp;is&nbsp;more&nbsp;like&nbsp;$500M&nbsp;-&nbsp;$1B.</li><li><strong>Capital&nbsp;Intensity&nbsp;&amp;&nbsp;Credibility&nbsp;Gap.&nbsp;&nbsp;</strong>CMS&nbsp;certification,&nbsp;IT&nbsp;systems&nbsp;integration,&nbsp;and&nbsp;benchmark&nbsp;development&nbsp;require&nbsp;heavy&nbsp;upfront&nbsp;capital&nbsp;and&nbsp;strong&nbsp;healthcare&nbsp;data&nbsp;credibility&nbsp;to&nbsp;be&nbsp;taken&nbsp;seriously.</li></ul>',
  NULL,
  NULL,
  'SCHEDULED'::"CompanyIntakeStatus",
  '2026-02-04T00:00:00.000Z'::timestamp,
  NULL,
  'DRAFT'::"ResearchStatus",
  '<p></p>',
  NULL,
  '2026-03-04T16:59:11.021Z'::timestamp,
  '2026-03-04T16:07:58.967Z'::timestamp,
  '2026-03-04T16:59:11.022Z'::timestamp
);

CREATE TEMP TABLE _resolved_company AS
SELECT
  COALESCE(
    (
      SELECT c."id"
      FROM "Company" c
      WHERE lower(c."name") = lower(s.name)
      ORDER BY c."createdAt" ASC
      LIMIT 1
    ),
    s.source_company_id
  ) AS company_id
FROM _src_company s;

INSERT INTO "Company" (
  "id",
  "name",
  "legalName",
  "website",
  "headquartersCity",
  "headquartersState",
  "headquartersCountry",
  "companyType",
  "primaryCategory",
  "primaryCategoryOther",
  "declineReason",
  "declineReasonOther",
  "leadSourceType",
  "leadSourceHealthSystemId",
  "leadSourceOther",
  "leadSourceNotes",
  "description",
  "atAGlanceProblem",
  "atAGlanceSolution",
  "atAGlanceImpact",
  "atAGlanceKeyStrengths",
  "atAGlanceKeyConsiderations",
  "googleTranscriptUrl",
  "spinOutOwnershipPercent",
  "intakeStatus",
  "intakeScheduledAt",
  "screeningEvaluationAt",
  "researchStatus",
  "researchNotes",
  "researchError",
  "researchUpdatedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  rc.company_id,
  s.name,
  s.legal_name,
  s.website,
  s.headquarters_city,
  s.headquarters_state,
  s.headquarters_country,
  s.company_type,
  s.primary_category,
  s.primary_category_other,
  s.decline_reason,
  s.decline_reason_other,
  s.lead_source_type,
  s.lead_source_health_system_id,
  s.lead_source_other,
  s.lead_source_notes,
  s.description,
  s.at_a_glance_problem,
  s.at_a_glance_solution,
  s.at_a_glance_impact,
  s.at_a_glance_key_strengths,
  s.at_a_glance_key_considerations,
  s.google_transcript_url,
  s.spin_out_ownership_percent,
  s.intake_status,
  s.intake_scheduled_at,
  s.screening_evaluation_at,
  s.research_status,
  s.research_notes,
  s.research_error,
  s.research_updated_at,
  s.source_created_at,
  s.source_updated_at
FROM _src_company s
CROSS JOIN _resolved_company rc
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "legalName" = EXCLUDED."legalName",
  "website" = EXCLUDED."website",
  "headquartersCity" = EXCLUDED."headquartersCity",
  "headquartersState" = EXCLUDED."headquartersState",
  "headquartersCountry" = EXCLUDED."headquartersCountry",
  "companyType" = EXCLUDED."companyType",
  "primaryCategory" = EXCLUDED."primaryCategory",
  "primaryCategoryOther" = EXCLUDED."primaryCategoryOther",
  "declineReason" = EXCLUDED."declineReason",
  "declineReasonOther" = EXCLUDED."declineReasonOther",
  "leadSourceType" = EXCLUDED."leadSourceType",
  "leadSourceHealthSystemId" = EXCLUDED."leadSourceHealthSystemId",
  "leadSourceOther" = EXCLUDED."leadSourceOther",
  "leadSourceNotes" = EXCLUDED."leadSourceNotes",
  "description" = EXCLUDED."description",
  "atAGlanceProblem" = EXCLUDED."atAGlanceProblem",
  "atAGlanceSolution" = EXCLUDED."atAGlanceSolution",
  "atAGlanceImpact" = EXCLUDED."atAGlanceImpact",
  "atAGlanceKeyStrengths" = EXCLUDED."atAGlanceKeyStrengths",
  "atAGlanceKeyConsiderations" = EXCLUDED."atAGlanceKeyConsiderations",
  "googleTranscriptUrl" = EXCLUDED."googleTranscriptUrl",
  "spinOutOwnershipPercent" = EXCLUDED."spinOutOwnershipPercent",
  "intakeStatus" = EXCLUDED."intakeStatus",
  "intakeScheduledAt" = EXCLUDED."intakeScheduledAt",
  "screeningEvaluationAt" = EXCLUDED."screeningEvaluationAt",
  "researchStatus" = EXCLUDED."researchStatus",
  "researchNotes" = EXCLUDED."researchNotes",
  "researchError" = EXCLUDED."researchError",
  "researchUpdatedAt" = EXCLUDED."researchUpdatedAt",
  "updatedAt" = EXCLUDED."updatedAt";

CREATE TEMP TABLE _src_pipeline (
  source_pipeline_id TEXT NOT NULL,
  phase "CompanyPipelinePhase" NOT NULL,
  intake_decision "CompanyIntakeDecision" NOT NULL,
  intake_decision_at TIMESTAMP,
  intake_decision_notes TEXT,
  next_step TEXT,
  venture_studio_contract_executed_at TIMESTAMP,
  venture_likelihood_percent INT,
  venture_expected_close_date TIMESTAMP,
  target_loi_count INT NOT NULL,
  s1_invested BOOLEAN NOT NULL,
  s1_investment_at TIMESTAMP,
  s1_investment_amount_usd NUMERIC(16,2),
  venture_studio_criteria JSON,
  portfolio_added_at TIMESTAMP,
  source_created_at TIMESTAMP NOT NULL,
  source_updated_at TIMESTAMP NOT NULL
);

INSERT INTO _src_pipeline VALUES (
  'cmmc8du0h00032ml144rklcsf',
  'INTAKE'::"CompanyPipelinePhase",
  'PENDING'::"CompanyIntakeDecision",
  NULL,
  NULL,
  'Screen with Alliance',
  NULL,
  NULL,
  NULL,
  3,
  false,
  NULL,
  NULL,
  '[{"category":"Products & Services","rationale":"There is a clear need for the product and services imagined by Project Kina (e.g. regulatory requirement). However, it is not clear if replacement product alone or additional products and services are required.","assessment":"yellow"},{"category":"Value Proposition","rationale":"Large multi-hospital systems are spending $2M - $5M+ annually and dependent on time-lagging information to inform improvement and recovery workflows. If use cases, and new technology integration opportunities can be developed for immediate orchestration and impact, the ROI could be significant.","assessment":"yellow"},{"category":"Prioritization","rationale":"It is not clear at this time how high of a priority it is for health systems to explore parallel or replacement solutions in this space. Also, given the length of current vendor contracts, it is not clear that enough Alliance health systems could make this a priority co-development project within the next year. More discussions will be required to frame the use cases and potential for impact.","assessment":"grey"},{"category":"Differentiation","rationale":"Major differentiation opportunity for Project Kina is the integration/use of new data sources and AI tools to analyze data and orchestrate real-time service recovery. Existing incumbents are theoretically well capitalized to also take advantage of this whitespace, so beating them to this innovation is a risk.","assessment":"red"},{"category":"Defined Buyer","rationale":"Since the product and services are fairly well defined, identifying the specific target buyer is straightforward and would be the C-Suite team responsible for patient experience and workforce satisfaction.","assessment":"green"},{"category":"Implementation","rationale":"Implementation would require advanced integration with core systems to capture real-time data and orchestrate frictionless workflows. In addition, there would be a replacement of current tools, reporting infrastructure, and process to adopt a new system(s).","assessment":"yellow"},{"category":"Concept Maturity","rationale":"Project Kina is a pre-product concept and has not yet been implemented at a health system. It is seeking lead partners to develop the NewCo. Further research is needed on the problems to be solved outside the regulatory use case since that is a longer term (18 - 36 mo) roadmap capability for a NewCo.","assessment":"red"},{"category":"Team","rationale":"Project Kina is a pre-product concept and has not identified a leadership team or qualities of the founding team and partners to form NewCo.","assessment":"red"},{"category":"Market Size","rationale":"Total addressable market is likely large, given the current market spend. The serviceable obtainable market for Project Kina will depend on defining the initial product and price point.","assessment":"grey"}]'::json,
  NULL,
  '2026-03-04T16:08:17.969Z'::timestamp,
  '2026-03-04T16:59:01.205Z'::timestamp
);

INSERT INTO "CompanyPipeline" (
  "id",
  "companyId",
  "phase",
  "intakeDecision",
  "intakeDecisionAt",
  "intakeDecisionNotes",
  "nextStep",
  "ventureStudioContractExecutedAt",
  "ventureLikelihoodPercent",
  "ventureExpectedCloseDate",
  "targetLoiCount",
  "s1Invested",
  "s1InvestmentAt",
  "s1InvestmentAmountUsd",
  "ventureStudioCriteria",
  "portfolioAddedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  p.source_pipeline_id,
  rc.company_id,
  p.phase,
  p.intake_decision,
  p.intake_decision_at,
  p.intake_decision_notes,
  p.next_step,
  p.venture_studio_contract_executed_at,
  p.venture_likelihood_percent,
  p.venture_expected_close_date,
  p.target_loi_count,
  p.s1_invested,
  p.s1_investment_at,
  p.s1_investment_amount_usd,
  p.venture_studio_criteria,
  p.portfolio_added_at,
  p.source_created_at,
  p.source_updated_at
FROM _src_pipeline p
CROSS JOIN _resolved_company rc
ON CONFLICT ("companyId") DO UPDATE
SET
  "phase" = EXCLUDED."phase",
  "intakeDecision" = EXCLUDED."intakeDecision",
  "intakeDecisionAt" = EXCLUDED."intakeDecisionAt",
  "intakeDecisionNotes" = EXCLUDED."intakeDecisionNotes",
  "nextStep" = EXCLUDED."nextStep",
  "ventureStudioContractExecutedAt" = EXCLUDED."ventureStudioContractExecutedAt",
  "ventureLikelihoodPercent" = EXCLUDED."ventureLikelihoodPercent",
  "ventureExpectedCloseDate" = EXCLUDED."ventureExpectedCloseDate",
  "targetLoiCount" = EXCLUDED."targetLoiCount",
  "s1Invested" = EXCLUDED."s1Invested",
  "s1InvestmentAt" = EXCLUDED."s1InvestmentAt",
  "s1InvestmentAmountUsd" = EXCLUDED."s1InvestmentAmountUsd",
  "ventureStudioCriteria" = EXCLUDED."ventureStudioCriteria",
  "portfolioAddedAt" = EXCLUDED."portfolioAddedAt",
  "updatedAt" = EXCLUDED."updatedAt";


CREATE TEMP TABLE _src_intake_doc (
  source_document_id TEXT NOT NULL,
  doc_type "CompanyDocumentType" NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  notes TEXT,
  uploaded_at TIMESTAMP NOT NULL,
  source_created_at TIMESTAMP NOT NULL
);

INSERT INTO _src_intake_doc VALUES (
  'cmmcbvvdv00022m3iuxr8clbz',
  'INTAKE_REPORT'::"CompanyDocumentType",
  'Project Kina - Intake Report - 2026-03-04',
  'https://docs.google.com/presentation/d/1iFuUtt2nQNRDqAVlegk3QMolapRo52073nwdXJLujDQ/edit?usp=drivesdk',
  'Generated from Intake Report template.',
  '2026-03-04T17:46:18.403Z'::timestamp,
  '2026-03-04T17:46:18.403Z'::timestamp
);

CREATE TEMP TABLE _resolved_intake_doc AS
SELECT
  COALESCE(
    (
      SELECT d."id"
      FROM "CompanyDocument" d
      CROSS JOIN _resolved_company rc
      CROSS JOIN _src_intake_doc sd
      WHERE d."companyId" = rc.company_id
        AND d."type" = sd.doc_type
        AND lower(d."title") = lower(sd.title)
      ORDER BY d."uploadedAt" DESC, d."createdAt" DESC
      LIMIT 1
    ),
    (SELECT source_document_id FROM _src_intake_doc LIMIT 1)
  ) AS document_id;

INSERT INTO "CompanyDocument" (
  "id",
  "companyId",
  "type",
  "title",
  "url",
  "uploadedAt",
  "notes",
  "createdAt"
)
SELECT
  rd.document_id,
  rc.company_id,
  sd.doc_type,
  sd.title,
  sd.url,
  sd.uploaded_at,
  sd.notes,
  sd.source_created_at
FROM _resolved_intake_doc rd
CROSS JOIN _resolved_company rc
CROSS JOIN _src_intake_doc sd
ON CONFLICT ("id") DO UPDATE
SET
  "companyId" = EXCLUDED."companyId",
  "type" = EXCLUDED."type",
  "title" = EXCLUDED."title",
  "url" = EXCLUDED."url",
  "uploadedAt" = EXCLUDED."uploadedAt",
  "notes" = EXCLUDED."notes";


SELECT
  c."id" AS company_id,
  c."name" AS company_name,
  c."intakeStatus" AS intake_status,
  c."intakeScheduledAt" AS intake_scheduled_at,
  p."phase" AS pipeline_phase,
  p."nextStep" AS next_step,
  (SELECT COUNT(*) FROM "CompanyDocument" d WHERE d."companyId" = c."id" AND d."type" = 'INTAKE_REPORT') AS intake_report_count
FROM "Company" c
LEFT JOIN "CompanyPipeline" p ON p."companyId" = c."id"
WHERE c."id" = (SELECT company_id FROM _resolved_company);

COMMIT;
