import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BizFileReviewWorkspace } from "@/components/companies/bizfile-review/bizfile-review-workspace";
import type { ExtractedBizFileData } from "@/services/bizfile";

const fixture: ExtractedBizFileData = {
  entityDetails: { uen: "202400001A", name: "Example Pte. Ltd.", entityType: "PRIVATE_LIMITED", status: "LIVE" },
};

function setup(onConfirm = vi.fn()) {
  return render(<BizFileReviewWorkspace initialData={fixture} sourcePanel={<div>PDF source</div>}
    onCancel={vi.fn()} onReset={vi.fn()} onConfirm={onConfirm} />);
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
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      entityDetails: expect.objectContaining({ name: "Corrected Pte. Ltd." }),
    }));
  });

  it("shows section issue counts and attention states", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Entity details.*1 error/i })).toBeVisible();
    expect(screen.getByText("Needs attention")).toBeVisible();
  });

  it("provides responsive Document and Review panels", () => {
    setup();
    expect(screen.getByRole("tab", { name: "Document" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Review" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Document" }));
    expect(screen.getByText("PDF source")).toBeVisible();
  });

  it("saves with Ctrl+S and only warns before unload while dirty", () => {
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
  });

  it("preserves user edits when initialData identity changes", () => {
    const props = { sourcePanel: <div>PDF source</div>, onCancel: vi.fn(), onReset: vi.fn(), onConfirm: vi.fn() };
    const { rerender } = render(<BizFileReviewWorkspace {...props} initialData={fixture} />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "My edit" } });
    rerender(<BizFileReviewWorkspace {...props} initialData={{ ...fixture, entityDetails: { ...fixture.entityDetails } }} />);
    expect(screen.getByLabelText("Company name")).toHaveValue("My edit");
  });
});
