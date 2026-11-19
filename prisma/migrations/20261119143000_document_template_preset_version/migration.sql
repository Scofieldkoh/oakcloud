-- Require a monotonic precondition for preset updates (including existing presets).
ALTER TABLE "document_template_presets" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
