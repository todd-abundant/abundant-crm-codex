DO $$
BEGIN
  CREATE TYPE "CoInvestorInteractionType" AS ENUM ('MEETING', 'EMAIL', 'CALL', 'EVENT', 'INTRO', 'NOTE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NextActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NextActionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CoInvestorInteraction" (
  "id" TEXT NOT NULL,
  "coInvestorId" TEXT NOT NULL,
  "interactionType" "CoInvestorInteractionType" NOT NULL DEFAULT 'NOTE',
  "channel" TEXT,
  "subject" TEXT,
  "summary" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoInvestorInteraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NextAction" (
  "id" TEXT NOT NULL,
  "coInvestorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "details" TEXT,
  "ownerName" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "status" "NextActionStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "NextActionPriority" NOT NULL DEFAULT 'MEDIUM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NextAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CoInvestorInteraction_coInvestorId_occurredAt_idx"
  ON "CoInvestorInteraction"("coInvestorId", "occurredAt");

CREATE INDEX IF NOT EXISTS "CoInvestorInteraction_interactionType_idx"
  ON "CoInvestorInteraction"("interactionType");

CREATE INDEX IF NOT EXISTS "NextAction_coInvestorId_status_dueAt_idx"
  ON "NextAction"("coInvestorId", "status", "dueAt");

CREATE INDEX IF NOT EXISTS "NextAction_ownerName_status_idx"
  ON "NextAction"("ownerName", "status");

DO $$
BEGIN
  ALTER TABLE "CoInvestorInteraction"
    ADD CONSTRAINT "CoInvestorInteraction_coInvestorId_fkey"
    FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "NextAction"
    ADD CONSTRAINT "NextAction_coInvestorId_fkey"
    FOREIGN KEY ("coInvestorId") REFERENCES "CoInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
