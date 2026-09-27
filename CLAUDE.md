## Development Guidelines

**Key Principles:**
- Keep code clean, efficient, modular, reusable, and consistent
- Update documentation under `docs/` instead of creating new files
- Follow [Design Guidelines](./guides/DESIGN_GUIDELINE.md) for UI work
- Log unrelated errors or improvements here
## Known Unrelated Issues

- A cold `tsc --noEmit` needs about 5.2 GB of heap, above Node's default limit, so `npm run typecheck` now runs tsc with `--max-old-space-size=8192` (the same limit as the CI build step). (2026-09-26)
- The real-Chromium PDF tests under `tests/document-output` need Chrome; on a Linux box without it, set `CHROME_PATH` (for example to Playwright's Chromium). Vitest runs in `Asia/Singapore` time so date assertions match the firm's time zone. (2026-09-27)
