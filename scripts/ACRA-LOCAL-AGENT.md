# ACRA Bizfile local filing agent — Phase 1 proof of concept

## Scope

This is a **manual-attended navigation test**, not a production filing integration.
It opens a visible, isolated Playwright Chromium session on the staff computer.
The staff member handles Singpass/Corppass login. The script records only the
current official Bizfile page host, path, title, and inspection timestamp to stdout.

It does **not** fill forms, upload documents, submit filings, approve statutory
declarations, pay fees, capture cookies, persist authentication, or update company
records. It is deliberately not connected to OakCloud's server APIs yet.

## Prerequisites

- Node.js compatible with OakCloud's package.json
- Repository dependencies installed, including Playwright and its Chromium browser
- Staff's permission to use the relevant ACRA/CSP account
- Confirmation that the intended automation complies with ACRA's terms and policies

## Run on staff's Windows computer

From the OakCloud repository:

```powershell
npx playwright install chromium
npx tsx scripts/acra-local-agent-poc.ts
```

The script opens the official Bizfile website, waits for the staff member to
navigate manually, prints limited page metadata, and closes the isolated browser
when instructed. It does not reuse the user's existing browser profile.

## Proposed next gates (not implemented)

1. Validate Bizfile's live UI and obtain clearance for permitted automation.
2. Define the director-appointment filing payload and per-field verification.
3. Add authenticated OakCloud filing jobs, device pairing, and short-lived downloads.
4. Build transaction-specific browser adapters, stopping before declaration/payment.
5. Capture acknowledgements and reconcile uncertain submissions before updating
   company records.

Do not use this prototype to file real changes without independent staff review.
