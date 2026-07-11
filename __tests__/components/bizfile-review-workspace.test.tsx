import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BizFileReviewWorkspace } from "@/components/companies/bizfile-review/bizfile-review-workspace";
import type { ExtractedBizFileData } from "@/services/bizfile";

const fixture: ExtractedBizFileData = {
  entityDetails: { uen: "202400001A", name: "Example Pte. Ltd.", entityType: "PRIVATE_LIMITED", status: "LIVE" },
};

function setup(onConfirm = vi.fn(), overrides: Partial<React.ComponentProps<typeof BizFileReviewWorkspace>> = {}) {
  return render(<BizFileReviewWorkspace initialData={fixture} sourcePanel={<div>PDF source</div>}
    onCancel={vi.fn()} onReset={vi.fn()} onConfirm={onConfirm} {...overrides} />);
}

describe("BizFileReviewWorkspace", () => {
  it("blocks invalid confirmation, focuses the field, and submits normalized corrections", async () => {
    const onConfirm = vi.fn();
    setup(onConfirm);
    expect(screen.getByText("Review extracted information")).toBeVisible();
    expect(screen.getByText("10 sections")).toBeVisible();
    const name = screen.getByLabelText("Company name");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Save" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Company name is required")).toBeVisible();
    await waitFor(() => expect(name).toHaveFocus());
    fireEvent.change(name, { target: { value: "  Corrected Pte. Ltd.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Save" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      entityDetails: expect.objectContaining({ name: "Corrected Pte. Ltd." }),
    })));
    await screen.findByText("Save completed.");
  });

  it("shows section issue counts and attention states", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Entity details.*1 error/i })).toBeVisible();
    expect(screen.getByText("Needs attention")).toBeVisible();
  });

  it("provides responsive Document and Review panels", () => {
    setup();
    expect(screen.queryByTestId("desktop-split")).not.toBeInTheDocument();
    const mobile = screen.getByTestId("mobile-workspace");
    expect(screen.getByRole("tab", { name: "Document" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Review" })).toBeVisible();
    expect(within(mobile).queryByText("PDF source")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Document" }));
    expect(within(mobile).getByText("PDF source")).toBeVisible();
    expect(within(mobile).queryByLabelText("Company name")).not.toBeInTheDocument();
  });

  it("offers compact navigation to every section below lg", () => {
    setup();
    const select = screen.getByRole("combobox", { name: "Review section" });
    expect(within(select).getAllByRole("option")).toHaveLength(10);
    fireEvent.change(select, { target: { value: "charges" } });
    expect(screen.getByText("Charges", { selector: "h2" })).toBeVisible();
  });

  it("starts with the hydration-safe mobile tree and switches when the lg media query changes", () => {
    let matches = false;
    let notify = () => {};
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      get matches() { return matches; }, media: "(min-width: 1024px)", onchange: null,
      addEventListener: vi.fn((_type, listener: () => void) => { notify = listener; }),
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    setup();
    expect(screen.getByTestId("mobile-workspace")).toBeVisible();
    expect(screen.queryByTestId("desktop-split")).not.toBeInTheDocument();
    act(() => { matches = true; notify(); });
    expect(screen.getByTestId("desktop-split")).toBeVisible();
    expect(screen.queryByTestId("mobile-workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Document" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("does not read a wide viewport while producing the initial render tree", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true, media: "(min-width: 1024px)", onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    const markup = renderToString(<BizFileReviewWorkspace initialData={fixture} sourcePanel={<div>PDF source</div>}
      onCancel={vi.fn()} onReset={vi.fn()} onConfirm={vi.fn()} />);
    expect(markup).toContain('data-testid="mobile-workspace"');
    expect(markup).not.toContain('data-testid="desktop-split"');
    vi.unstubAllGlobals();
  });

  it("saves with Ctrl+S and only warns before unload while dirty", async () => {
    const onConfirm = vi.fn();
    setup(onConfirm);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Changed" } });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ entityDetails: expect.objectContaining({ name: "Changed" }) }));
    await screen.findByText("Save completed.");
  });

  it("preserves user edits when initialData identity changes", () => {
    const props = { sourcePanel: <div>PDF source</div>, onCancel: vi.fn(), onReset: vi.fn(), onConfirm: vi.fn() };
    const { rerender } = render(<BizFileReviewWorkspace {...props} initialData={fixture} />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "My edit" } });
    rerender(<BizFileReviewWorkspace {...props} initialData={{ ...fixture, entityDetails: { ...fixture.entityDetails } }} />);
    expect(screen.getByLabelText("Company name")).toHaveValue("My edit");
  });

  it("cancels with Ctrl/Cmd+Backspace outside editors but preserves input editing", () => {
    const onCancel = vi.fn();
    setup(vi.fn(), { onCancel });
    const name = screen.getByLabelText("Company name");
    fireEvent.keyDown(name, { key: "Backspace", ctrlKey: true });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Backspace", metaKey: true });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("awaits save, blocks duplicate saves, and reports rejection for retry", async () => {
    let reject!: (error: Error) => void;
    const onConfirm = vi.fn(() => new Promise<void>((_, rejectPromise) => { reject = rejectPromise; }));
    setup(onConfirm);
    const save = screen.getByRole("button", { name: "Confirm & Save" });
    fireEvent.click(save);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(save).toBeDisabled();
    reject(new Error("network"));
    expect(await screen.findByRole("status")).toHaveTextContent("Save failed. Please try again.");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("deduplicates server issues, gives client messages precedence, and clears an edited field issue", async () => {
    setup(vi.fn(), { serverIssues: [
      { path: "entityDetails.name", section: "entity", message: "Server name issue" },
      { path: "entityDetails.name", section: "entity", message: "Duplicate server issue" },
    ] });
    expect(screen.getAllByText("Server name issue")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "" } });
    expect(screen.getByText("Company name is required")).toBeVisible();
    expect(screen.queryByText("Server name issue")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Retried Pte. Ltd." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Save" }));
    await waitFor(() => expect(screen.queryByText("Save blocked")).not.toBeInTheDocument());
  });

  it("restores an identical server issue payload when a retry response arrives", async () => {
    const issue = { path: "entityDetails.name", section: "entity" as const, message: "Server name issue" };
    const props = { sourcePanel: <div>PDF source</div>, onCancel: vi.fn(), onReset: vi.fn(), onConfirm: vi.fn() };
    const { rerender } = render(<BizFileReviewWorkspace {...props} initialData={fixture} serverIssues={[issue]} />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Corrected Pte. Ltd." } });
    expect(screen.queryByText("Server name issue")).not.toBeInTheDocument();
    rerender(<BizFileReviewWorkspace {...props} initialData={fixture} serverIssues={[{ ...issue }]} />);
    expect(await screen.findByText("Server name issue")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Save blocked");
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("does not mark untouched issue-free sections complete and marks visited valid sections reviewed", () => {
    setup();
    expect(screen.getByRole("button", { name: /Addresses.*Not reviewed/i })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Addresses/i }));
    expect(screen.getByRole("button", { name: /Addresses.*Complete/i })).toBeVisible();
  });

  it("labels reset precisely and presents verification guidance and invalid-attempt summary", async () => {
    setup(vi.fn(), { aiMetadata: { modelUsed: "model", providerUsed: "provider" } });
    expect(screen.getByRole("button", { name: "Upload Different File" })).toBeVisible();
    expect(screen.getByText(/AI-extracted data may be inaccurate/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Save blocked: 1 issue in 1 section.");
  });

  it("always presents neutral AI verification guidance without metadata", () => {
    setup();
    expect(screen.getByText(/AI-extracted data may be inaccurate/i)).toBeVisible();
  });
});
