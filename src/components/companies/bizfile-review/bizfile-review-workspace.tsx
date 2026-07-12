"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const EMPTY_SERVER_ISSUES: BizFileReviewIssue[] = [];

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function repeatingRecordTotal(draft: BizFileReviewDraft) {
  return (draft.entityDetails.formerNames?.length ?? 0) + (draft.shareCapital?.length ?? 0) +
    (draft.officers?.length ?? 0) + (draft.shareholders?.length ?? 0) + (draft.charges?.length ?? 0);
}

function useLargeViewport() {
  const [isLarge, setIsLarge] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 1024px)");
    if (!media) return;
    const update = () => setIsLarge(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isLarge;
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function useDirtyHistoryGuard(isDirty: boolean) {
  const lifecycle = useRef({ exiting: false, suppressNextPopState: false });
  const disarm = useCallback(() => { lifecycle.current.exiting = true; }, []);
  const rearm = useCallback(() => { lifecycle.current.exiting = false; }, []);

  useEffect(() => {
    if (!isDirty) return;
    const current = lifecycle.current;
    let mounted = true;
    let popStateReset: ReturnType<typeof setTimeout> | null = null;
    current.exiting = false;
    current.suppressNextPopState = false;
    const handlePopState = () => {
      if (current.exiting) return;
      if (current.suppressNextPopState) {
        current.suppressNextPopState = false;
        return;
      }
      if (window.confirm("Discard your unsaved BizFile review changes?")) {
        current.exiting = true;
        popStateReset = setTimeout(() => {
          if (mounted) current.exiting = false;
          popStateReset = null;
        }, 0);
        return;
      }
      current.suppressNextPopState = true;
      window.history.forward();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (current.exiting) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const handleNavigationClick = (event: MouseEvent) => {
      if (current.exiting || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target.toLowerCase() !== "_self")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const currentUrl = new URL(window.location.href);
      if (destination.pathname === currentUrl.pathname && destination.search === currentUrl.search) return;

      if (window.confirm("Discard your unsaved BizFile review changes?")) {
        current.exiting = true;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    };
    document.addEventListener("click", handleNavigationClick, true);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      mounted = false;
      if (popStateReset) clearTimeout(popStateReset);
      document.removeEventListener("click", handleNavigationClick, true);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      current.suppressNextPopState = false;
    };
  }, [isDirty]);
  return useMemo(() => ({ disarm, rearm }), [disarm, rearm]);
}

export function BizFileReviewWorkspace({ initialData, aiMetadata, sourcePanel, isSaving = false,
  serverIssues = EMPTY_SERVER_ISSUES, onConfirm, onCancel, onReset }: BizFileReviewWorkspaceProps) {
  const workspaceRef = useRef<HTMLElement>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const [draft, setDraft] = useState<BizFileReviewDraft>(() => normalizeBizFileReviewDraft(clone(initialData)));
  const [activeSection, setActiveSection] = useState<BizFileReviewSectionId>("entity");
  const [visitedSections, setVisitedSections] = useState(() => new Set<BizFileReviewSectionId>(["entity"]));
  const [mobilePanel, setMobilePanel] = useState<"document" | "review">("review");
  const [dismissedServerPaths, setDismissedServerPaths] = useState(() => new Set<string>());
  const [locallySaving, setLocallySaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const isLarge = useLargeViewport();
  const validation = useMemo(() => validateBizFileReview(draft), [draft]);
  const clientIssues = useMemo(() => validation.issues.map((item) => item.path === "entityDetails.name" && item.message === "Required"
    ? { ...item, message: "Company name is required" } : item), [validation.issues]);
  const issues = useMemo(() => {
    const byPath = new Map(clientIssues.map((issue) => [issue.path, issue]));
    for (const issue of serverIssues) {
      if (!dismissedServerPaths.has(issue.path) && !byPath.has(issue.path)) byPath.set(issue.path, issue);
    }
    return Array.from(byPath.values());
  }, [clientIssues, dismissedServerPaths, serverIssues]);
  useEffect(() => setDismissedServerPaths(new Set()), [serverIssues]);
  const initialSnapshot = useState(() => JSON.stringify(normalizeBizFileReviewDraft(clone(initialData))))[0];
  const isDirty = JSON.stringify(normalizeBizFileReviewDraft(draft)) !== initialSnapshot;
  const historyGuard = useDirtyHistoryGuard(isDirty);
  const busy = isSaving || locallySaving;
  const exit = useCallback((action: () => void) => {
    if (!isDirty || window.confirm("Discard your unsaved BizFile review changes?")) { historyGuard.disarm(); action(); }
  }, [historyGuard, isDirty]);

  useEffect(() => () => {
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
  }, []);

  const selectSection = useCallback((section: BizFileReviewSectionId) => {
    setActiveSection(section);
    setVisitedSections((current) => new Set(current).add(section));
  }, []);

  const changeDraft = useCallback((next: BizFileReviewDraft) => {
    setDismissedServerPaths((dismissed) => {
      const updated = new Set(dismissed);
      for (const issue of serverIssues) {
        const segments = issue.path.split(".");
        const read = (value: unknown) => segments.reduce<unknown>((current, key) => current != null ? (current as Record<string, unknown>)[key] : undefined, value);
        if (!Object.is(read(draft), read(next))) updated.add(issue.path);
      }
      return updated;
    });
    setDraft(next);
  }, [draft, serverIssues]);

  const focusIssue = useCallback((first: BizFileReviewIssue) => {
    selectSection(first.section);
    setMobilePanel("review");
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = setTimeout(() => {
      const selector = `[data-field-path="${CSS.escape(first.path)}"]`;
      const target = workspaceRef.current?.querySelector<HTMLElement>(selector);
      target?.focus();
      if (!target) workspaceRef.current?.querySelector<HTMLElement>("main, [data-review-summary]")?.focus();
      focusTimeoutRef.current = null;
    });
  }, [selectSection]);

  const confirm = useCallback(async () => {
    if (busy || saveInFlightRef.current) return;
    if (issues.length) {
      const sectionCount = new Set(issues.map((issue) => issue.section)).size;
      setSaveSummary(`Save blocked: ${issues.length} ${issues.length === 1 ? "issue" : "issues"} in ${sectionCount} ${sectionCount === 1 ? "section" : "sections"}.`);
      focusIssue(issues[0]);
      return;
    }
    saveInFlightRef.current = true;
    setLocallySaving(true);
    setSaveSummary("Saving reviewed information…");
    historyGuard.disarm();
    try {
      await onConfirm(normalizeBizFileReviewDraft(draft));
      setSaveSummary("Save completed.");
    } catch {
      historyGuard.rearm();
      setSaveSummary("Save failed. Please try again.");
    } finally {
      saveInFlightRef.current = false;
      setLocallySaving(false);
    }
  }, [busy, draft, focusIssue, historyGuard, issues, onConfirm]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); void confirm(); }
      if (event.key === "Backspace" && !isEditableTarget(event.target)) { event.preventDefault(); exit(onCancel); }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [confirm, exit, onCancel]);

  const issuesFor = (section: BizFileReviewSectionId) => issues.filter((item) => item.section === section);
  const reviewedValidSections = BIZFILE_REVIEW_SECTIONS.filter((section) => visitedSections.has(section) && issuesFor(section).length === 0).length;
  const sectionNavigation = (
    <nav aria-label="Review sections" className="hidden w-52 shrink-0 overflow-y-auto border-r border-border-primary p-2 lg:block">
      {BIZFILE_REVIEW_SECTIONS.map((section) => {
        const count = issuesFor(section).length;
        const state = count ? "Errors" : visitedSections.has(section) ? "Complete" : "Not reviewed";
        const Icon = count ? AlertCircle : state === "Complete" ? CheckCircle2 : Circle;
        return <button key={section} type="button" onClick={() => selectSection(section)}
          aria-label={`${sectionLabels[section]}, ${count} ${count === 1 ? "error" : "errors"}, ${state}`}
          className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${activeSection === section ? "bg-oak-primary/10" : ""}`}>
          <Icon className="h-4 w-4" /><span className="flex-1">{sectionLabels[section]}</span><span>{count || state}</span>
        </button>;
      })}
    </nav>
  );
  const editor = (
    <div className="flex h-full min-h-0 flex-col bg-background-primary">
      <label className="border-b border-border-primary p-2 text-xs lg:hidden">Review section
        <select aria-label="Review section" value={activeSection} onChange={(event) => selectSection(event.target.value as BizFileReviewSectionId)}
          className="ml-2 h-8 rounded-md border border-border-primary bg-background-primary px-2">
          {BIZFILE_REVIEW_SECTIONS.map((section) => <option key={section} value={section}>{sectionLabels[section]}</option>)}
        </select>
      </label>
      <div className="flex min-h-0 flex-1">{sectionNavigation}
        <main tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-4">
          <BizFileReviewSections activeSection={activeSection} draft={draft} onChange={changeDraft} issues={issues} />
        </main>
      </div>
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border-primary bg-background-primary p-3">
        {saveSummary && <p role="status" data-review-summary tabIndex={-1} className="mr-auto text-xs text-text-secondary">{saveSummary}</p>}
        <button type="button" disabled={busy} onClick={() => exit(onCancel)}>Cancel</button>
        <button type="button" disabled={busy} onClick={() => exit(onReset)}>Upload Different File</button>
        <button type="button" disabled={busy} onClick={() => void confirm()} className="rounded bg-oak-primary px-4 py-2 text-white disabled:opacity-50">
          {busy ? "Saving…" : "Confirm & Save"}
        </button>
      </footer>
    </div>
  );

  return <section ref={workspaceRef} className="flex h-full min-h-0 flex-col">
    <header className="border-b border-border-primary p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="font-semibold">Review extracted information</h1><p className="text-xs text-text-muted"><span>10 sections</span> · {reviewedValidSections} reviewed · {issues.length} issues · {repeatingRecordTotal(draft)} records</p></div>
        <span className="text-xs">{issues.length ? "Needs attention" : reviewedValidSections === 10 ? "Ready to save" : "Review in progress"}</span>
      </div>
      <div className="mt-1 text-xs text-text-muted">
        {aiMetadata && <p>{aiMetadata.modelName ?? aiMetadata.modelUsed} · {aiMetadata.providerUsed}{aiMetadata.formattedCost ? ` · ${aiMetadata.formattedCost}` : ""}</p>}
        <p className="text-text-secondary">AI-extracted data may be inaccurate. Verify it against the source document.</p>
      </div>
      {!isLarge && <div role="tablist" className="mt-3 flex gap-2">
        {(["document", "review"] as const).map((panel) => <button key={panel} role="tab" aria-selected={mobilePanel === panel}
          onClick={() => setMobilePanel(panel)} className="rounded border px-3 py-1.5 text-xs">{panel === "document" ? "Document" : "Review"}</button>)}
      </div>}
    </header>
    <div className="min-h-0 flex-1">
      {isLarge ? <div data-testid="desktop-split" className="h-full"><ResizableSplitView className="h-full" leftPanel={sourcePanel}
        rightPanel={editor} defaultLeftWidth={45} minLeftWidth={30} maxLeftWidth={65} /></div>
        : <div data-testid="mobile-workspace" className="h-full">{mobilePanel === "document" ? sourcePanel : editor}</div>}
    </div>
  </section>;
}
