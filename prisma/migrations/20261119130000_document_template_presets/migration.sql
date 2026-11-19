-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_TEMPLATE_PRESET_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_TEMPLATE_PRESET_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_TEMPLATE_PRESET_DELETED';

-- CreateTable
CREATE TABLE "document_template_presets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalized_name" VARCHAR(100) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_template_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_preset_items" (
    "id" TEXT NOT NULL,
    "preset_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "document_template_preset_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_template_presets_tenant_id_updated_at_idx" ON "document_template_presets"("tenant_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_presets_tenant_id_normalized_name_key" ON "document_template_presets"("tenant_id", "normalized_name");

-- CreateIndex
CREATE INDEX "document_template_preset_items_template_id_idx" ON "document_template_preset_items"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_preset_items_preset_id_display_order_key" ON "document_template_preset_items"("preset_id", "display_order");

-- AddForeignKey
ALTER TABLE "document_template_presets" ADD CONSTRAINT "document_template_presets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_preset_items" ADD CONSTRAINT "document_template_preset_items_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "document_template_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_preset_items" ADD CONSTRAINT "document_template_preset_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
