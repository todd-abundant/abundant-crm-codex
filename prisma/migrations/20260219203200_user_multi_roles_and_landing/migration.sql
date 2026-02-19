-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- Backfill existing user role values
INSERT INTO "UserRoleAssignment" ("id", "userId", "role", "createdAt")
SELECT
  ('c' || substr(md5("id" || ':' || "role"::text), 1, 24))::text,
  "id",
  "role",
  CURRENT_TIMESTAMP
FROM "User";

-- DropIndex
DROP INDEX "User_role_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role";

-- CreateIndex
CREATE INDEX "UserRoleAssignment_role_idx" ON "UserRoleAssignment"("role");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_userId_idx" ON "UserRoleAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleAssignment_userId_role_key" ON "UserRoleAssignment"("userId", "role");

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
