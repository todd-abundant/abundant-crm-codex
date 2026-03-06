ALTER TABLE "CompanyScreeningSurveyAnswer"
ADD COLUMN "isSkipped" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CompanyScreeningSurveyAnswer"
ALTER COLUMN "score" DROP NOT NULL;
