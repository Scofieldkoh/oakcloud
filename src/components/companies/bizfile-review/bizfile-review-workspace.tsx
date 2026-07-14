"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Circle } from "lucide-react";
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
import { mapIdentificationType } from "@/services/bizfile";
import type { ContactIdentityCandidate, ContactMatchPreview } from "@/types/contact-identity";
import { BizFileReviewSections } from "./bizfile-review-sections";

export interface BizFileReviewWorkspaceProps {
  initialData: ExtractedBizFileData;
  sourcePanel: React.ReactNode;
  isSaving?: boolean;
  serverIssues?: BizFileReviewIssue[];
  onConfirm: (data: ExtractedBizFileData) => void | Promise<void>;
  onCancel: () => void;
  onReset: () => void;
}

const sectionLabels: Record<BizFileReviewSectionId, string> = {
  entity: "Entity", addresses: "Addresses", activities: "Activities",
  capital: "Capital", officers: "Officers", shareholders: "Shareholders",
  auditor: "Auditor", compliance: "Compliance", charges: "Charges", document: "Document",
};
const EMPTY_SERVER_ISSUES: BizFileReviewIssue[] = [];

type MatchPreviews = Record<string, ContactMatchPreview | null>;

export function buildBizFileContactIdentityCandidates(
  draft: BizFileReviewDraft,
  sections: Array<"officers" | "shareholders">,
): ContactIdentityCandidate[] {
  const candidates: ContactIdentityCandidate[] = [];
  if (sections.includes("officers")) {
    (draft.officers ?? []).forEach((officer, index) => {
      const [firstName = "", ...rest] = officer.name.trim().split(/\s+/);
      candidates.push({
        source: "BIZFILE", sourceRecordId: `officers.${index}`, contactType: "INDIVIDUAL",
        firstName, lastName: rest.join(" ") || undefined,
        identificationType: mapIdentificationType(officer.identificationType) || undefined,
        identificationNumber: officer.identificationNumber,
        nationality: officer.nationality, fullAddress: officer.address,
      });
    });
  }
  if (sections.includes("shareholders")) {
    (draft.shareholders ?? []).forEach((shareholder, index) => {
      if (shareholder.type === "CORPORATE") {
        candidates.push({
          source: "BIZFILE", sourceRecordId: `shareholders.${index}`, contactType: "CORPORATE",
          corporateName: shareholder.name, corporateUen: shareholder.identificationNumber,
          fullAddress: shareholder.address,
        });
        return;
      }
      const [firstName = "", ...rest] = shareholder.name.trim().split(/\s+/);
      candidates.push({
        source: "BIZFILE", sourceRecordId: `shareholders.${index}`, contactType: "INDIVIDUAL",
        firstName, lastName: rest.join(" ") || undefined,
        identificationType: mapIdentificationType(shareholder.identificationType) || undefined,
        identificationNumber: shareholder.identificationNumber,
        nationality: shareholder.nationality, fullAddress: shareholder.address,
      });
    });
  }
  return candidates;
}

function unresolvedMatchIssues(draft: BizFileReviewDraft, previews: MatchPreviews): BizFileReviewIssue[] {
  const issues: BizFileReviewIssue[] = [];
  for (const section of ["officers", "shareholders"] as const) {
    (draft[section] ?? []).forEach((record, index) => {
      const preview = previews[`${section}.${index}`];
      const resolution = record.contactResolution;
      if (preview && (!resolution || (
        resolution.action === "REUSE" &&
        (resolution.contactId !== preview.contactId || preview.blockedByIdentifierConflict)
      ))) {
        issues.push({
          path: `${section}.${index}.contactResolution`,
          message: resolution
            ? "Review the updated contact match and choose again"
            : "Choose how to resolve this contact match",
          section,
        });
      }
    });
  }
  return issues;
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
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
    let exitReset: ReturnType<typeof setTimeout> | null = null;
    current.exiting = false;
    current.suppressNextPopState = false;
    const resetExitingNextTask = () => {
      if (exitReset) clearTimeout(exitReset);
      exitReset = setTimeout(() => {
        if (mounted) current.exiting = false;
        exitReset = null;
      }, 0);
    };
    const handlePopState = () => {
      if (current.exiting) return;
      if (current.suppressNextPopState) {
        current.suppressNextPopState = false;
        return;
      }
      if (window.confirm("Discard your unsaved BizFile review changes?")) {
        current.exiting = true;
        resetExitingNextTask();
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
        resetExitingNextTask();
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
      if (exitReset) clearTimeout(exitReset);
      document.removeEventListener("click", handleNavigationClick, true);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      current.suppressNextPopState = false;
    };
  }, [isDirty]);
  return useMemo(() => ({ disarm, rearm }), [disarm, rearm]);
}

export function BizFileReviewWorkspace({ initialData, sourcePanel, isSaving = false,
  serverIssues = EMPTY_SERVER_ISSUES, onConfirm, onCancel, onReset }: BizFileReviewWorkspaceProps) {
  const workspaceRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Partial<Record<BizFileReviewSectionId, HTMLButtonElement | null>>>({});
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const [draft, setDraft] = useState<BizFileReviewDraft>(() => normalizeBizFileReviewDraft(clone(initialData)));
  const [activeSection, setActiveSection] = useState<BizFileReviewSectionId>("entity");
  const [visitedSections, setVisitedSections] = useState(() => new Set<BizFileReviewSectionId>(["entity"]));
  const [mobilePanel, setMobilePanel] = useState<"document" | "review">("review");
  const [dismissedServerPaths, setDismissedServerPaths] = useState(() => new Set<string>());
  const [locallySaving, setLocallySaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const [matchPreviews, setMatchPreviews] = useState<MatchPreviews>({});
  const isLarge = useLargeViewport();
  const validation = useMemo(() => validateBizFileReview(draft), [draft]);
  const clientIssues = useMemo(() => validation.issues.map((item) => item.path === "entityDetails.name" && item.message === "Required"
    ? { ...item, message: "Company name is required" } : item), [validation.issues]);
  const issues = useMemo(() => {
    const byPath = new Map(clientIssues.map((issue) => [issue.path, issue]));
    for (const issue of serverIssues) {
      if (!dismissedServerPaths.has(issue.path) && !byPath.has(issue.path)) byPath.set(issue.path, issue);
    }
    for (const issue of unresolvedMatchIssues(draft, matchPreviews)) {
      if (!byPath.has(issue.path)) byPath.set(issue.path, issue);
    }
    return Array.from(byPath.values());
  }, [clientIssues, dismissedServerPaths, draft, matchPreviews, serverIssues]);
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

  const moveSection = useCallback((direction: -1 | 1, focusTab = false) => {
    const currentIndex = BIZFILE_REVIEW_SECTIONS.indexOf(activeSection);
    const nextIndex = (currentIndex + direction + BIZFILE_REVIEW_SECTIONS.length) % BIZFILE_REVIEW_SECTIONS.length;
    const nextSection = BIZFILE_REVIEW_SECTIONS[nextIndex];
    if (focusTab) tabRefs.current[nextSection]?.focus();
    selectSection(nextSection);
  }, [activeSection, selectSection]);

  useEffect(() => {
    const selectedTab = tabRefs.current[activeSection];
    selectedTab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeSection]);

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

  const requestMatchPreviews = useCallback(async (
    value: BizFileReviewDraft,
    sections: Array<"officers" | "shareholders">,
  ): Promise<MatchPreviews> => {
    const candidates = buildBizFileContactIdentityCandidates(value, sections);
    if (candidates.length === 0) return {};
    const response = await fetch("/api/contacts/match-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates }),
    });
    if (!response.ok) throw new Error("Unable to preview contact matches");
    const result = await response.json() as { matches: MatchPreviews };
    setMatchPreviews((current) => ({ ...current, ...result.matches }));
    return result.matches;
  }, []);

  const activeIdentitySnapshot = useMemo(() => activeSection === "officers" || activeSection === "shareholders"
    ? JSON.stringify(buildBizFileContactIdentityCandidates(draft, [activeSection])) : "", [activeSection, draft]);
  useEffect(() => {
    if (activeSection !== "officers" && activeSection !== "shareholders") return;
    void requestMatchPreviews(draft, [activeSection]).catch(() => undefined);
    // Decisions do not affect identity preview; the snapshot retriggers only for identity edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdentitySnapshot, activeSection, requestMatchPreviews]);

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
    let currentIssues = issues;
    if (buildBizFileContactIdentityCandidates(draft, ["officers", "shareholders"]).length > 0) {
      try {
        const latest = await requestMatchPreviews(draft, ["officers", "shareholders"]);
        const freshMatchIssues = unresolvedMatchIssues(draft, { ...matchPreviews, ...latest });
        const byPath = new Map(currentIssues.map((item) => [item.path, item]));
        freshMatchIssues.forEach((item) => byPath.set(item.path, item));
        currentIssues = Array.from(byPath.values());
      } catch {
        setSaveSummary("Save blocked: contact matches could not be checked. Please try again.");
        return;
      }
    }
    if (currentIssues.length) {
      const sectionCount = new Set(currentIssues.map((issue) => issue.section)).size;
      setSaveSummary(`Save blocked: ${currentIssues.length} ${currentIssues.length === 1 ? "issue" : "issues"} in ${sectionCount} ${sectionCount === 1 ? "section" : "sections"}.`);
      focusIssue(currentIssues[0]);
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
  }, [busy, draft, focusIssue, historyGuard, issues, matchPreviews, onConfirm, requestMatchPreviews]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); void confirm(); }
      if (event.key === "Backspace" && !isEditableTarget(event.target)) { event.preventDefault(); exit(onCancel); }
      if (!isEditableTarget(event.target) && ["<", ",", ">", "."].includes(event.key)) {
        event.preventDefault();
        moveSection(event.key === "<" || event.key === "," ? -1 : 1);
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [confirm, exit, moveSection, onCancel]);

  const issuesFor = (section: BizFileReviewSectionId) => issues.filter((item) => item.section === section);
  const reviewedValidSections = BIZFILE_REVIEW_SECTIONS.filter((section) => visitedSections.has(section) && issuesFor(section).length === 0).length;
  const sectionNavigation = isLarge ? (
    <div className="sticky top-0 z-10 flex shrink-0 items-center gap-1 border-b border-border-primary bg-background-primary p-2">
      <button type="button" onClick={() => moveSection(-1)} title="Previous section (Ctrl + <)"
        aria-label="Previous section (Ctrl + <)" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background-tertiary focus:outline-none focus:ring-2 focus:ring-oak-primary/30">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div role="tablist" aria-label="Review sections" className="flex min-w-0 flex-1 gap-1 overflow-x-auto scroll-smooth">
        {BIZFILE_REVIEW_SECTIONS.map((section) => {
          const count = issuesFor(section).length;
          const state = count ? "Errors" : visitedSections.has(section) ? "Complete" : "Not reviewed";
          const Icon = count ? AlertCircle : state === "Complete" ? CheckCircle2 : Circle;
          return <button key={section} ref={(element) => { tabRefs.current[section] = element; }} type="button" role="tab"
            id={`review-tab-${section}`} aria-controls="review-section-panel" aria-selected={activeSection === section}
            tabIndex={activeSection === section ? 0 : -1} onClick={() => selectSection(section)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              moveSection(event.key === "ArrowLeft" ? -1 : 1, true);
            }}
            aria-label={`${sectionLabels[section]}, ${count} ${count === 1 ? "error" : "errors"}, ${state}`}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-oak-primary/30 ${activeSection === section ? "bg-oak-primary/10 text-oak-primary" : "text-text-secondary hover:bg-background-tertiary"}`}>
            <Icon className={`h-3.5 w-3.5 ${count ? "text-status-error" : ""}`} />
            <span>{sectionLabels[section]}</span>
            {count > 0 ? <span className="min-w-4 rounded bg-status-error/10 px-1 text-center text-2xs text-status-error">{count}</span> : null}
          </button>;
        })}
      </div>
      <button type="button" onClick={() => moveSection(1)} title="Next section (Ctrl + >)"
        aria-label="Next section (Ctrl + >)" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background-tertiary focus:outline-none focus:ring-2 focus:ring-oak-primary/30">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  ) : null;
  const editorContent = (
    <div className="flex h-full min-h-0 flex-col bg-background-primary">
      {!isLarge ? <label className="border-b border-border-primary p-2 text-xs">Review section
        <select aria-label="Review section" value={activeSection} onChange={(event) => selectSection(event.target.value as BizFileReviewSectionId)}
          className="ml-2 h-8 rounded-md border border-border-primary bg-background-primary px-2">
          {BIZFILE_REVIEW_SECTIONS.map((section) => <option key={section} value={section}>{sectionLabels[section]}</option>)}
        </select>
      </label> : sectionNavigation}
      <div className="flex min-h-0 flex-1">
        <main id="review-section-panel" role={isLarge ? "tabpanel" : undefined} aria-labelledby={isLarge ? `review-tab-${activeSection}` : undefined}
          tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-4">
          <BizFileReviewSections activeSection={activeSection} draft={draft} onChange={changeDraft} issues={issues} matchPreviews={matchPreviews} />
        </main>
      </div>
    </div>
  );

  const actionFooter = (
    <footer role="contentinfo" className="flex min-h-14 flex-wrap items-center justify-end gap-2 border-t border-border-primary bg-background-primary p-3">
      {saveSummary && <p role="status" data-review-summary tabIndex={-1} className="mr-auto text-xs text-text-secondary">{saveSummary}</p>}
      <button type="button" disabled={busy} onClick={() => exit(onCancel)} className="btn-ghost btn-sm">Cancel</button>
      <button type="button" disabled={busy} onClick={() => exit(onReset)} className="btn-secondary btn-sm">Upload Different File</button>
      <button type="button" disabled={busy} onClick={() => void confirm()} className="btn-primary btn-sm">
        {busy ? "Saving…" : "Confirm & Save"}
      </button>
    </footer>
  );

  return <section ref={workspaceRef} className="flex min-h-0 flex-col lg:h-[calc(100dvh-7rem)]">
    <header className="shrink-0 border-b border-border-primary p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-semibold">Review extracted information</h1>
        <span className="text-xs">{issues.length ? "Needs attention" : reviewedValidSections === 10 ? "Ready to save" : "Review in progress"}</span>
      </div>
      {!isLarge && <div role="tablist" className="mt-3 flex gap-2">
        {(["document", "review"] as const).map((panel) => <button key={panel} role="tab" aria-selected={mobilePanel === panel}
          onClick={() => setMobilePanel(panel)} className="rounded border px-3 py-1.5 text-xs">{panel === "document" ? "Document" : "Review"}</button>)}
      </div>}
    </header>
    {isLarge ? <div data-testid="desktop-split" className="relative min-h-0 flex-1">
      <div data-testid="review-content-region" className="absolute inset-x-0 bottom-16 top-0 min-h-0">
        <ResizableSplitView className="h-full"
          leftPanel={<div data-testid="review-source" data-review-source className="h-full overflow-hidden">{sourcePanel}</div>}
          rightPanel={<div className="relative h-full">
            <div data-testid="review-editor" data-review-editor className="h-full">{editorContent}</div>
            <div className="absolute left-0 right-0 top-full">{actionFooter}</div>
          </div>}
          leftPanelClassName="!overflow-hidden" rightPanelClassName="min-w-0 !overflow-visible"
          defaultLeftWidth={70} minLeftWidth={40} maxLeftWidth={80} />
      </div>
    </div> : <div data-testid="mobile-workspace" className="h-[min(780px,calc(100dvh-88px))] min-h-0">
      {mobilePanel === "document" ? <div className="h-full overflow-hidden">{sourcePanel}</div>
        : <div className="flex h-full min-h-0 flex-col"><div className="min-h-0 flex-1">{editorContent}</div>{actionFooter}</div>}
    </div>}
  </section>;
}
