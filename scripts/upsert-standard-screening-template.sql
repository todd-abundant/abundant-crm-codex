-- Upsert the Standard Screening Survey template and its question links.
-- Target template key: STANDARD_SCREENING_V1
-- Safe to rerun: yes (idempotent key- and content-based resolution)
--
-- Safety default:
--   cleanup_extra_template_questions = false
-- This preserves any extra questions currently attached to the template.
-- If you intentionally want exact parity, set it to true after review.

BEGIN;

CREATE TEMP TABLE _template_config (
  template_key TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_description TEXT,
  cleanup_extra_template_questions BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO _template_config (
  template_key,
  template_name,
  template_description,
  cleanup_extra_template_questions
)
VALUES (
  'STANDARD_SCREENING_V1',
  'Standard Screening Survey',
  'Core desirability, feasibility, impact, viability, and co-development readiness survey used across portfolio screening.',
  false
);

CREATE TEMP TABLE _stg_template_question (
  question_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  prompt TEXT NOT NULL,
  instructions TEXT,
  scale_min INT NOT NULL,
  scale_max INT NOT NULL,
  display_order INT NOT NULL
);

INSERT INTO _stg_template_question (
  question_key,
  category,
  prompt,
  instructions,
  scale_min,
  scale_max,
  display_order
)
VALUES
  (
    'q01',
    'DESIRABILITY',
    'How does what has been described align with the challenges you are facing?',
    NULL,
    1,
    10,
    0
  ),
  (
    'q02',
    'DESIRABILITY',
    'What is your organization''s current competency in solving this problem?',
    NULL,
    1,
    10,
    1
  ),
  (
    'q03',
    'DESIRABILITY',
    'How desirable is this solution for your organization?',
    NULL,
    1,
    10,
    2
  ),
  (
    'q04',
    'DESIRABILITY',
    'Is this a top-three strategic priority for your organization in the next 18 months?',
    NULL,
    1,
    10,
    3
  ),
  (
    'q05',
    'FEASABILITY',
    'Overall, how feasible would it be for your organization to implement a solution like this in the next year given resourcing and governance?',
    NULL,
    1,
    10,
    4
  ),
  (
    'q06',
    'FEASABILITY',
    'How feasible would it be to implement this solution from an IT perspective?',
    NULL,
    1,
    10,
    5
  ),
  (
    'q07',
    'FEASABILITY',
    'How feasible would it be to implement this solution from a clinical perspective?',
    NULL,
    1,
    10,
    6
  ),
  (
    'q08',
    'VIABILITY',
    'How differentiated is this solution from others you''ve evaluated or have in place today?',
    NULL,
    1,
    10,
    7
  ),
  (
    'q09',
    'VIABILITY',
    'How attractive is the business model for a health system customer?',
    NULL,
    1,
    10,
    8
  ),
  (
    'q10',
    'IMPACT',
    'What magnitude of ROI do you anticipate seeing from this solution?',
    NULL,
    1,
    10,
    9
  ),
  (
    'q11',
    'IMPACT',
    'How confident are you in your ability to measure ROI for this solution?',
    NULL,
    1,
    10,
    10
  ),
  (
    'q12',
    'CO-DEVELOPMENT INTEREST',
    'If you are the right stakeholder to participate in co-development, how interested are you in being a co-development partner?',
    NULL,
    1,
    10,
    11
  ),
  (
    'q13',
    'CO-DEVELOPMENT INTEREST',
    'If you are not the right stakeholder at your organization, how likely are you to bring forward this co-development opportunity to key stakeholders?',
    NULL,
    1,
    10,
    12
  );

CREATE TEMP TABLE _resolved_template AS
SELECT
  COALESCE(
    (
      SELECT t."id"
      FROM "CompanyScreeningSurveyTemplate" t
      WHERE t."key" = (SELECT template_key FROM _template_config)
      LIMIT 1
    ),
    'imp_tpl_' || substr(md5((SELECT template_key FROM _template_config)), 1, 24)
  ) AS template_id,
  (SELECT template_key FROM _template_config) AS template_key,
  (SELECT template_name FROM _template_config) AS template_name,
  (SELECT template_description FROM _template_config) AS template_description;

INSERT INTO "CompanyScreeningSurveyTemplate" (
  "id",
  "key",
  "name",
  "description",
  "isActive",
  "isStandard",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  template_id,
  template_key,
  template_name,
  template_description,
  true,
  true,
  NULL,
  NOW(),
  NOW()
FROM _resolved_template
ON CONFLICT ("key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "isStandard" = true,
  "updatedAt" = NOW();

INSERT INTO "CompanyScreeningSurveyQuestion" (
  "id",
  "category",
  "prompt",
  "instructions",
  "scaleMin",
  "scaleMax",
  "isActive",
  "isStandard",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  COALESCE(
    (
      SELECT q."id"
      FROM "CompanyScreeningSurveyQuestion" q
      WHERE lower(trim(q."category")) = lower(trim(s.category))
        AND lower(trim(q."prompt")) = lower(trim(s.prompt))
      ORDER BY
        CASE WHEN q."isStandard" THEN 0 ELSE 1 END,
        q."createdAt" ASC,
        q."id" ASC
      LIMIT 1
    ),
    'imp_ssq_' || substr(md5((SELECT template_key FROM _template_config) || '|' || s.question_key), 1, 24)
  ) AS question_id,
  s.category,
  s.prompt,
  s.instructions,
  s.scale_min,
  s.scale_max,
  true,
  true,
  NULL,
  NOW(),
  NOW()
FROM _stg_template_question s
ON CONFLICT ("id") DO UPDATE
SET
  "category" = EXCLUDED."category",
  "prompt" = EXCLUDED."prompt",
  "instructions" = EXCLUDED."instructions",
  "scaleMin" = EXCLUDED."scaleMin",
  "scaleMax" = EXCLUDED."scaleMax",
  "isActive" = true,
  "isStandard" = true,
  "updatedAt" = NOW();

CREATE TEMP TABLE _resolved_question AS
SELECT
  s.question_key,
  s.display_order,
  s.category,
  s.prompt,
  s.instructions,
  q."id" AS question_id
FROM _stg_template_question s
JOIN LATERAL (
  SELECT qq."id"
  FROM "CompanyScreeningSurveyQuestion" qq
  WHERE lower(trim(qq."category")) = lower(trim(s.category))
    AND lower(trim(qq."prompt")) = lower(trim(s.prompt))
  ORDER BY
    CASE WHEN qq."isStandard" THEN 0 ELSE 1 END,
    qq."createdAt" ASC,
    qq."id" ASC
  LIMIT 1
) q ON TRUE;

DO $$
DECLARE
  expected_count INT;
  resolved_count INT;
BEGIN
  SELECT COUNT(*) INTO expected_count FROM _stg_template_question;
  SELECT COUNT(*) INTO resolved_count FROM _resolved_question;

  IF resolved_count <> expected_count THEN
    RAISE EXCEPTION
      'Template question resolution mismatch: expected %, resolved %.',
      expected_count,
      resolved_count;
  END IF;
END $$;

INSERT INTO "CompanyScreeningSurveyTemplateQuestion" (
  "id",
  "templateId",
  "questionId",
  "displayOrder",
  "categoryOverride",
  "promptOverride",
  "instructionsOverride",
  "createdAt"
)
SELECT
  COALESCE(
    (
      SELECT tq."id"
      FROM "CompanyScreeningSurveyTemplateQuestion" tq
      WHERE tq."templateId" = (SELECT template_id FROM _resolved_template)
        AND tq."questionId" = rq.question_id
      LIMIT 1
    ),
    'imp_tq_' || substr(md5((SELECT template_id FROM _resolved_template) || '|' || rq.question_key), 1, 24)
  ) AS template_question_id,
  (SELECT template_id FROM _resolved_template) AS template_id,
  rq.question_id,
  rq.display_order,
  rq.category,
  rq.prompt,
  rq.instructions,
  NOW()
FROM _resolved_question rq
ON CONFLICT ("templateId", "questionId") DO UPDATE
SET
  "displayOrder" = EXCLUDED."displayOrder",
  "categoryOverride" = EXCLUDED."categoryOverride",
  "promptOverride" = EXCLUDED."promptOverride",
  "instructionsOverride" = EXCLUDED."instructionsOverride";

DO $$
DECLARE
  cleanup_enabled BOOLEAN;
  target_template_id TEXT;
  linked_answer_count BIGINT;
BEGIN
  SELECT c.cleanup_extra_template_questions, t.template_id
    INTO cleanup_enabled, target_template_id
  FROM _template_config c
  CROSS JOIN _resolved_template t;

  IF cleanup_enabled THEN
    SELECT COUNT(*) INTO linked_answer_count
    FROM "CompanyScreeningSurveyAnswer" a
    WHERE a."templateId" = target_template_id;

    IF linked_answer_count > 0 THEN
      RAISE EXCEPTION
        'Cleanup blocked: template % has % linked answers. Keep cleanup=false or run a planned migration.',
        target_template_id,
        linked_answer_count;
    END IF;

    DELETE FROM "CompanyScreeningSurveyTemplateQuestion" tq
    WHERE tq."templateId" = target_template_id
      AND NOT EXISTS (
        SELECT 1
        FROM _resolved_question rq
        WHERE rq.question_id = tq."questionId"
      );
  END IF;
END $$;

-- Post-run summary
SELECT
  t."id" AS template_id,
  t."key" AS template_key,
  t."name" AS template_name,
  t."isActive" AS template_is_active,
  t."isStandard" AS template_is_standard,
  COUNT(tq."id") AS template_question_count
FROM "CompanyScreeningSurveyTemplate" t
LEFT JOIN "CompanyScreeningSurveyTemplateQuestion" tq
  ON tq."templateId" = t."id"
WHERE t."key" = (SELECT template_key FROM _template_config)
GROUP BY t."id", t."key", t."name", t."isActive", t."isStandard";

SELECT
  tq."displayOrder",
  q."category",
  q."prompt",
  q."isStandard" AS question_is_standard,
  q."isActive" AS question_is_active
FROM "CompanyScreeningSurveyTemplateQuestion" tq
JOIN "CompanyScreeningSurveyQuestion" q
  ON q."id" = tq."questionId"
WHERE tq."templateId" = (SELECT template_id FROM _resolved_template)
ORDER BY tq."displayOrder" ASC, tq."id" ASC;

COMMIT;
