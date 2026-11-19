-- Link a KYC/CDD form response person to a Contact (additive only).
-- A link binds one repeat row (or the whole response) by index AND a fingerprint taken at link time.

-- CreateTable
CREATE TABLE "contact_form_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "personRowIndex" INTEGER,
    "personFingerprint" VARCHAR(64) NOT NULL,
    "linkedById" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "unlinkedById" TEXT,

    CONSTRAINT "contact_form_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_form_suggestion_dismissals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "field" VARCHAR(40) NOT NULL,
    "valueHash" VARCHAR(64) NOT NULL,
    "dismissedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_form_suggestion_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_form_links_tenantId_contactId_unlinkedAt_idx" ON "contact_form_links"("tenantId", "contactId", "unlinkedAt");

-- CreateIndex
CREATE INDEX "contact_form_links_submissionId_idx" ON "contact_form_links"("submissionId");

-- CreateIndex
CREATE INDEX "contact_form_links_formId_idx" ON "contact_form_links"("formId");

-- CreateIndex
CREATE INDEX "contact_form_suggestion_dismissals_tenantId_idx" ON "contact_form_suggestion_dismissals"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_form_suggestion_dismissals_linkId_field_valueHash_key" ON "contact_form_suggestion_dismissals"("linkId", "field", "valueHash");

-- Active links only (Prisma cannot express partial or expression indexes): one active link per
-- contact and row, and one active link per row (a form person maps to one contact).
CREATE UNIQUE INDEX "contact_form_links_active_contact_row_key"
  ON "contact_form_links"("contactId", "submissionId", (COALESCE("personRowIndex", -1)))
  WHERE "unlinkedAt" IS NULL;

CREATE UNIQUE INDEX "contact_form_links_active_row_key"
  ON "contact_form_links"("submissionId", (COALESCE("personRowIndex", -1)))
  WHERE "unlinkedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "contact_form_links" ADD CONSTRAINT "contact_form_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_form_links" ADD CONSTRAINT "contact_form_links_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_form_links" ADD CONSTRAINT "contact_form_links_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_form_links" ADD CONSTRAINT "contact_form_links_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_form_suggestion_dismissals" ADD CONSTRAINT "contact_form_suggestion_dismissals_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "contact_form_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (manual): DROP TABLE "contact_form_suggestion_dismissals"; DROP TABLE "contact_form_links";
