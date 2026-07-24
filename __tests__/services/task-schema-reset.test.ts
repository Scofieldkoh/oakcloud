import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
const contactMergeService = readFileSync(
  join(root, "src", "services", "contact-merge.service.ts"),
  "utf8",
);
const contactDuplicateService = readFileSync(
  join(root, "src", "services", "contact-duplicate.service.ts"),
  "utf8",
);

function schemaBlock(kind: "model" | "enum", name: string): string {
  const match = schema.match(new RegExp(`^${kind} ${name} \\{[\\s\\S]*?^\\}`, "m"));
  return match?.[0] ?? "";
}

describe("modular task schema reset", () => {
  it("removes the legacy workflow schema and contact-service references", () => {
    expect(schema).not.toMatch(/^model workflow_/m);
    expect(schema).not.toMatch(/^enum Workflow/m);
    expect(schema).not.toMatch(/\bworkflow_[a-z0-9_]+\b/);
    expect(contactMergeService).not.toMatch(/workflow/i);
    expect(contactDuplicateService).not.toMatch(/workflow/i);
  });

  it.each([
    "TaskPipeline",
    "TaskPipelineVersion",
    "TaskPipelineStage",
    "Task",
    "TaskStage",
    "TaskStageChecklistItem",
    "TaskStageOutcome",
  ])("defines the %s model", (modelName) => {
    expect(schemaBlock("model", modelName)).not.toBe("");
  });

  it.each([
    "TaskStatus",
    "TaskStageStatus",
    "TaskStageActionType",
    "TaskStageOutcomeType",
  ])("defines the %s enum", (enumName) => {
    expect(schemaBlock("enum", enumName)).not.toBe("");
  });

  it("declares the required task schema invariants", () => {
    const pipeline = schemaBlock("model", "TaskPipeline");
    const version = schemaBlock("model", "TaskPipelineVersion");
    const pipelineStage = schemaBlock("model", "TaskPipelineStage");
    const task = schemaBlock("model", "Task");
    const taskStage = schemaBlock("model", "TaskStage");
    const outcome = schemaBlock("model", "TaskStageOutcome");

    expect(version).toMatch(/version\s+Int/);
    expect(version).toMatch(/@@unique\(\[pipelineId,\s*version\]\)/);
    expect(pipelineStage).toMatch(/position\s+Int/);
    expect(task).toMatch(/companyId\s+String\?/);
    expect(task).toMatch(/ownerId\s+String\?/);
    expect(task).toMatch(/dueDate\s+DateTime\?/);
    expect(taskStage).toMatch(/assigneeId\s+String\?/);
    expect(pipeline).toMatch(/deletedAt\s+DateTime\?/);
    expect(task).toMatch(/deletedAt\s+DateTime\?/);
    expect(outcome).toMatch(
      /company\s+Company\?\s+@relation\(fields: \[companyId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(outcome).toMatch(
      /generatedDocument\s+GeneratedDocument\?\s+@relation\(fields: \[generatedDocumentId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(outcome).toMatch(
      /esigningEnvelope\s+EsigningEnvelope\?\s+@relation\(fields: \[esigningEnvelopeId\], references: \[id\], onDelete: SetNull\)/,
    );
  });
});
