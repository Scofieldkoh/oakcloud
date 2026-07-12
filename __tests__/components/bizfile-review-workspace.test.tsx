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

  it.each(["Cancel", "Upload Different File"])("guards dirty %s and honors reject/accept", (name) => {
    const onCancel = vi.fn(); const onReset = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    setup(vi.fn(), { onCancel, onReset });
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name }));
    expect(onCancel).not.toHaveBeenCalled(); expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(name === "Cancel" ? onCancel : onReset).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("does not prompt on clean exit and guards the dirty cancel keyboard shortcut", () => {
    const onCancel = vi.fn(); const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    setup(vi.fn(), { onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled(); expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Changed" } });
    fireEvent.keyDown(window, { key: "Backspace", ctrlKey: true });
    expect(confirm).toHaveBeenCalledOnce(); expect(onCancel).toHaveBeenCalledOnce();
    confirm.mockRestore();
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

  it("guards dirty browser back navigation, restores on decline, and allows on accept", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => undefined);
    setup();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Changed" } });
    fireEvent.popState(window, { state: { page: "previous" } });
    expect(confirm).toHaveBeenCalledOnce(); expect(forward).not.toHaveBeenCalled();
    fireEvent.popState(window, { state: { page: "previous" } });
    expect(confirm).toHaveBeenCalledTimes(2); expect(back).toHaveBeenCalledOnce();
    confirm.mockRestore(); back.mockRestore(); forward.mockRestore();
  });

  it("preserves original history state and never accumulates sentinels across dirty cycles", () => {
    window.history.replaceState({ original: "state" }, "", window.location.href);
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    setup();
    const name = screen.getByLabelText("Company name");
    fireEvent.change(name, { target: { value: "Changed" } });
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.history.state.__bizFileReviewGuard).toMatch(/^bizfile-/);
    fireEvent.change(name, { target: { value: fixture.entityDetails.name } });
    expect(window.history.state).toEqual({ original: "state" });
    fireEvent.change(name, { target: { value: "Changed again" } });
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ __bizFileReviewGuard: expect.stringMatching(/^bizfile-/) }), "", window.location.href);
  });

  it.each(["Cancel", "Upload Different File"])("disarms history before accepted %s navigation and ordinary unmount", (label) => {
    window.history.replaceState({ original: label }, "", window.location.href);
    const callback = vi.fn(() => expect(window.history.state).toEqual({ original: label }));
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const rendered = setup(vi.fn(), label === "Cancel" ? { onCancel: callback } : { onReset: callback });
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(callback).toHaveBeenCalledOnce();
    rendered.unmount();
    expect(back).not.toHaveBeenCalled();
    confirm.mockRestore(); back.mockRestore();
  });

  it("removes the sentinel after save and leaves Back unguarded after completion", async () => {
    window.history.replaceState({ original: "save" }, "", window.location.href);
    const onConfirm = vi.fn(() => expect(window.history.state).toEqual({ original: "save" }));
    const confirm = vi.spyOn(window, "confirm");
    setup(onConfirm);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Save" }));
    await screen.findByText("Save completed.");
    fireEvent.popState(window, { state: { original: "previous" } });
    expect(confirm).not.toHaveBeenCalled();
    expect(window.history.state).toEqual({ original: "save" });
    confirm.mockRestore();
  });

  it("restores a declined Back with one sentinel and cleanup removes it", () => {
    window.history.replaceState({ original: "decline" }, "", window.location.href);
    const push = vi.spyOn(window.history, "pushState");
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    setup();
    const name = screen.getByLabelText("Company name");
    push.mockClear();
    fireEvent.change(name, { target: { value: "Changed" } });
    fireEvent.popState(window, { state: { original: "decline" } });
    expect(push).toHaveBeenCalledTimes(2);
    expect(forward).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: fixture.entityDetails.name } });
    expect(window.history.state).toEqual({ original: "decline" });
    confirm.mockRestore(); forward.mockRestore();
  });

  it("allows clean browser history navigation without prompting", () => {
    const confirm = vi.spyOn(window, "confirm");
    setup();
    fireEvent.popState(window, { state: { __bizFileReviewGuard: true } });
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
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
