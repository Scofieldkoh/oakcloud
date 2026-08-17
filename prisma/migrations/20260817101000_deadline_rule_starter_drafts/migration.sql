-- Seed only unpublished, tenant-scoped authoring records. These drafts are
-- deliberately unattached to variants and therefore cannot generate dates.

INSERT INTO "deadline_rules" (
  "id", "tenant_id", "code", "name", "description", "is_active",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), t."id", starter."code", starter."name", starter."description", TRUE,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" AS t
CROSS JOIN (
  VALUES
    ('SG_AGM_DUE', 'Singapore AGM Due Date', 'Starter statutory AGM rule sourced from Company.nextAgmDueDate'),
    ('SG_ANNUAL_RETURN', 'Singapore Annual Return', 'Starter statutory Annual Return rule sourced from Company.nextArDueDate'),
    ('SG_ECI', 'Singapore ECI', 'Starter statutory ECI rule requiring monthsAfterFye'),
    ('SG_FORM_C', 'Singapore Form C', 'Starter statutory Form C rule requiring monthsAfterFye')
) AS starter("code", "name", "description")
WHERE t."status" = 'ACTIVE'
ON CONFLICT ("tenant_id", "code") DO NOTHING;

INSERT INTO "deadline_rule_versions" (
  "id", "tenant_id", "rule_id", "version", "state", "schema_version",
  "recurrence", "applicability", "config_hash", "draft_revision",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), r."tenant_id", r."id", 0, 'DRAFT', 1,
  '{"schemaVersion":1,"kind":"ANNUALLY"}'::jsonb,
  '{"schemaVersion":1,"kind":"ALL","conditions":[]}'::jsonb,
  repeat(md5(r."code" || ':starter:v1'), 2), 1,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "deadline_rules" AS r
JOIN "tenants" AS t ON t."id" = r."tenant_id"
WHERE t."status" = 'ACTIVE'
  AND r."code" IN ('SG_AGM_DUE', 'SG_ANNUAL_RETURN', 'SG_ECI', 'SG_FORM_C')
  AND r."archived_at" IS NULL
ON CONFLICT ("rule_id", "version") DO NOTHING;

INSERT INTO "deadline_rule_parameter_definitions" (
  "id", "tenant_id", "rule_version_id", "key", "label", "type",
  "is_required", "default_value", "validation", "display_order",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), r."tenant_id", v."id", 'monthsAfterFye', 'Months after FYE',
  'INTEGER', TRUE, NULL, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "deadline_rules" AS r
JOIN "deadline_rule_versions" AS v
  ON v."rule_id" = r."id" AND v."version" = 0 AND v."state" = 'DRAFT'
WHERE r."code" IN ('SG_ECI', 'SG_FORM_C')
ON CONFLICT ("rule_version_id", "key") DO NOTHING;

INSERT INTO "deadline_milestone_templates" (
  "id", "tenant_id", "rule_version_id", "milestone_key", "name", "description",
  "type", "generation_mode", "date_expression", "business_day_adjustment",
  "display_order", "is_active", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), r."tenant_id", v."id", starter."milestone_key", starter."name", NULL,
  'STATUTORY', 'ONCE_PER_CYCLE', starter."date_expression"::jsonb, 'NONE',
  0, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "deadline_rules" AS r
JOIN "deadline_rule_versions" AS v
  ON v."rule_id" = r."id" AND v."version" = 0 AND v."state" = 'DRAFT'
JOIN (
  VALUES
    (
      'SG_AGM_DUE', 'agm-due', 'AGM due date',
      '{"kind":"SOURCE","source":{"kind":"COMPANY_FIELD","field":"nextAgmDueDate"}}'
    ),
    (
      'SG_ANNUAL_RETURN', 'annual-return-due', 'Annual Return due date',
      '{"kind":"SOURCE","source":{"kind":"COMPANY_FIELD","field":"nextArDueDate"}}'
    ),
    (
      'SG_ECI', 'eci-due', 'ECI due date',
      '{"kind":"ADD_MONTHS","source":{"kind":"COMPANY_FIELD","field":"financialYearEnd"},"amount":{"kind":"INTEGER_PARAMETER","key":"monthsAfterFye"}}'
    ),
    (
      'SG_FORM_C', 'form-c-due', 'Form C due date',
      '{"kind":"ADD_MONTHS","source":{"kind":"COMPANY_FIELD","field":"financialYearEnd"},"amount":{"kind":"INTEGER_PARAMETER","key":"monthsAfterFye"}}'
    )
) AS starter("code", "milestone_key", "name", "date_expression")
  ON starter."code" = r."code"
WHERE r."code" IN ('SG_AGM_DUE', 'SG_ANNUAL_RETURN', 'SG_ECI', 'SG_FORM_C')
ON CONFLICT ("rule_version_id", "milestone_key") DO NOTHING;
