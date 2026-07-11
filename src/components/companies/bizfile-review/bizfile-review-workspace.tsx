"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { ResizableSplitView } from "@/components/processing/resizable-split-view";
import {
  BIZFILE_REVIEW_SECTIONS,
  normalizeBizFileReviewDraft,
  validateBizFileReview,
  type BizFileReviewDraft,
  type BizFileReviewIssue,
  type BizFileReviewSectionId,
} from "@/lib/validations/bizfile-review";
import type { ExtractedBizFileData } from "@/services/bizfile";
import { BizFileReviewSections } from "./bizfile-review-sections";

export interface BizFileReviewWorkspaceProps {
  initialData: ExtractedBizFileData;
  aiMetadata?: { modelUsed: string; modelName?: string; providerUsed: string; formattedCost?: string; usage?: { totalTokens: number; pagesProcessed?: number } } | null;
  sourcePanel: React.ReactNode;
  isSaving?: boolean;
  serverIssues?: BizFileReviewIssue[];
  onConfirm: (data: ExtractedBizFileData) => void | Promise<void>;
  onCancel: () => void;
  onReset: () => void;
}

const sectionLabels: Record<BizFileReviewSectionId, string> = {
  entity: "Entity details", addresses: "Addresses", activities: "Business activities",
  capital: "Capital", officers: "Officers", shareholders: "Shareholders",
  auditor: "Auditor", compliance: "Compliance", charges: "Charges", document: "Document metadata",
};

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function repeatingRecordTotal(draft: BizFileReviewDraft) {
  return (draft.entityDetails.formerNames?.length ?? 0) + (draft.shareCapital?.length ?? 0) +
    (draft.officers?.length ?? 0) + (draft.shareholders?.length ?? 0) + (draft.charges?.length ?? 0);
}

export function BizFileReviewWorkspace({ initialData, aiMetadata, sourcePanel, isSaving = false,
  serverIssues = [], onConfirm, onCancel, onReset }: BizFileReviewWorkspaceProps) {
  const [draft, setDraft] = useState<BizFileReviewDraft>(() => clone(initialData));
  const [activeSection, setActiveSection] = useState<BizFileReviewSectionId>("entity");
  const [mobilePanel, setMobilePanel] = useState<"document" | "review">("review");
  const validation = useMemo(() => validateBizFileReview(draft), [draft]);
  const issues = useMemo(() => [...validation.issues.map((item) => item.path === "entityDetails.name" && item.message === "Required"
    ? { ...item, message: "Company name is required" } : item), ...serverIssues], [validation.issues, serverIssues]);
  const initialSnapshot = useState(() => JSON.stringify(normalizeBizFileReviewDraft(clone(initialData))))[0];
  const isDirty = JSON.stringify(normalizeBizFileReviewDraft(draft)) !== initialSnapshot;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const confirm = useCallback(() => {
    if (issues.length) {
      const first = issues[0];
      setActiveSection(first.section);
      setMobilePanel("review");
      window.setTimeout(() => {
        const controls = document.querySelectorAll<HTMLElement>("input, select, textarea");
        const target = Array.from(controls).find((control) => control.dataset.fieldPath === first.path ||
          control.getAttribute("aria-describedby")?.split(" ").some((id) => document.getElementById(id)?.textContent === first.message));
        target?.focus();
      });
      return;
    }
    void onConfirm(normalizeBizFileReviewDraft(draft));
  }, [draft, issues, onConfirm]);

  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); confirm(); }
    };
    window.addEventListener("keydown", save);
    return () => window.removeEventListener("keydown", save);
  }, [confirm]);

  const issuesFor = (section: BizFileReviewSectionId) => issues.filter((item) => item.section === section);
  const validSections = BIZFILE_REVIEW_SECTIONS.filter((section) => issuesFor(section).length === 0).length;
  const editor = (
    <div className={`${mobilePanel === "review" ? "block" : "hidden"} lg:flex h-full min-h-0 flex-col bg-background-primary`}>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Review sections" className="hidden w-52 shrink-0 overflow-y-auto border-r border-border-primary p-2 md:block">
          {BIZFILE_REVIEW_SECTIONS.map((section) => {
            const count = issuesFor(section).length;
            const state = count ? "Errors" : section === activeSection && isDirty ? "Needs attention" : "Complete";
            const Icon = count ? AlertCircle : state === "Complete" ? CheckCircle2 : Circle;
            return <button key={section} type="button" onClick={() => setActiveSection(section)}
              aria-label={`${sectionLabels[section]}, ${count} ${count === 1 ? "error" : "errors"}, ${state}`}
              className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${activeSection === section ? "bg-oak-primary/10" : ""}`}>
              <Icon className="h-4 w-4" /><span className="flex-1">{sectionLabels[section]}</span>
              <span>{count || state}</span>
            </button>;
          })}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          <BizFileReviewSections activeSection={activeSection} draft={draft} onChange={setDraft} issues={issues} />
        </main>
      </div>
      <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border-primary bg-background-primary p-3">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={onReset}>Reset</button>
        <button type="button" disabled={isSaving} onClick={confirm} className="rounded bg-oak-primary px-4 py-2 text-white">
          {isSaving ? "Saving…" : "Confirm & Save"}
        </button>
      </footer>
    </div>
  );

  return <section className="flex h-full min-h-0 flex-col">
    <header className="border-b border-border-primary p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="font-semibold">Review extracted information</h1><p className="text-xs text-text-muted"><span>10 sections</span> · {validSections} valid · {issues.length} issues · {repeatingRecordTotal(draft)} records</p></div>
        <span className="text-xs">{issues.length ? "Needs attention" : "Ready to save"}</span>
      </div>
      {aiMetadata && <p className="mt-1 text-xs text-text-muted">{aiMetadata.modelName ?? aiMetadata.modelUsed} · {aiMetadata.providerUsed}{aiMetadata.formattedCost ? ` · ${aiMetadata.formattedCost}` : ""}</p>}
      <div role="tablist" className="mt-3 flex gap-2 lg:hidden">
        {(["document", "review"] as const).map((panel) => <button key={panel} role="tab" aria-selected={mobilePanel === panel}
          onClick={() => setMobilePanel(panel)} className="rounded border px-3 py-1.5 text-xs">{panel === "document" ? "Document" : "Review"}</button>)}
      </div>
    </header>
    <div className="min-h-0 flex-1">
      <ResizableSplitView className="h-full" leftPanel={<div className={`${mobilePanel === "document" ? "block" : "hidden"} h-full lg:block`}>{sourcePanel}</div>}
        rightPanel={editor} defaultLeftWidth={45} minLeftWidth={30} maxLeftWidth={65} />
    </div>
  </section>;
}
