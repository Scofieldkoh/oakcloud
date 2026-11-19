-- Sentroweb screening of a company, its current directors and its current shareholders.
-- Additive only: five enums and two new tables (runs and per-entity results). Nothing existing
-- is altered or dropped.
-- Rollback (only if no app version that writes these rows has run): DROP TABLE
-- "sentroweb_check_results", "sentroweb_check_runs"; then DROP TYPE the five Sentroweb enums.

-- CreateEnum
CREATE TYPE "SentrowebCheckRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SentrowebCheckOverallResult" AS ENUM ('CLEAR', 'POSSIBLE_MATCH', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "SentrowebEntityKind" AS ENUM ('COMPANY', 'INDIVIDUAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "SentrowebSearchType" AS ENUM ('INDIVIDUAL', 'ENTITY');

-- CreateEnum
CREATE TYPE "SentrowebResultStatus" AS ENUM ('CLEAR', 'POSSIBLE_MATCH', 'ERROR', 'NOT_RUN');

-- CreateTable
CREATE TABLE "sentroweb_check_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "SentrowebCheckRunStatus" NOT NULL DEFAULT 'QUEUED',
    "overallResult" "SentrowebCheckOverallResult",
    "errorCode" VARCHAR(64),
    "entityCount" INTEGER NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "balanceBefore" INTEGER,
    "claimToken" VARCHAR(36),
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sentroweb_check_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sentroweb_check_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "entityKind" "SentrowebEntityKind" NOT NULL,
    "searchType" "SentrowebSearchType" NOT NULL,
    "roles" TEXT[],
    "sourceRefs" JSONB NOT NULL DEFAULT '[]',
    "contactId" TEXT,
    "name" TEXT NOT NULL,
    "identifierType" TEXT,
    "identifier" TEXT,
    "status" "SentrowebResultStatus" NOT NULL DEFAULT 'NOT_RUN',
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "categoryCounts" JSONB NOT NULL DEFAULT '{}',
    "matches" JSONB NOT NULL DEFAULT '[]',
    "sentrowebReportId" TEXT,
    "monitorEnabled" BOOLEAN,
    "searchSubmittedAt" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "documentId" TEXT,
    "evidencePngKey" TEXT,
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "sentroweb_check_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sentroweb_check_runs_tenantId_companyId_createdAt_idx" ON "sentroweb_check_runs"("tenantId", "companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "sentroweb_check_runs_status_leaseExpiresAt_idx" ON "sentroweb_check_runs"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "sentroweb_check_results_runId_idx" ON "sentroweb_check_results"("runId");

-- CreateIndex
CREATE INDEX "sentroweb_check_results_tenantId_companyId_idx" ON "sentroweb_check_results"("tenantId", "companyId");

-- AddForeignKey
ALTER TABLE "sentroweb_check_runs" ADD CONSTRAINT "sentroweb_check_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentroweb_check_runs" ADD CONSTRAINT "sentroweb_check_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentroweb_check_runs" ADD CONSTRAINT "sentroweb_check_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentroweb_check_results" ADD CONSTRAINT "sentroweb_check_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "sentroweb_check_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentroweb_check_results" ADD CONSTRAINT "sentroweb_check_results_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one QUEUED or RUNNING run per company. Prisma cannot express a partial unique index,
-- so it exists only here.
CREATE UNIQUE INDEX "sentroweb_check_runs_one_active_per_company_key"
  ON "sentroweb_check_runs"("companyId")
  WHERE "status" IN ('QUEUED', 'RUNNING');
