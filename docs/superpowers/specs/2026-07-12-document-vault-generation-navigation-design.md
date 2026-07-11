# Document Vault and Document Generation Navigation Design

## Scope

Rebrand the user-facing Document Processing module as **Document Vault** and move document template navigation into the Document Generation experience. Existing routes and internal processing identifiers remain unchanged.

## Navigation

- Rename the sidebar item `Document Processing` to `Document Vault`; it continues to link to `/processing`.
- Keep `Document Generation` as a direct sidebar link to `/generated-documents`.
- Remove the standalone `Templates` item from the Administration section.
- Add a shared top-level tab bar to the Generated Documents and Templates pages:
  - `Generated Documents` links to `/generated-documents`.
  - `Templates` links to `/admin/template-partials`.
- The active tab is derived from the current route. The tab bar uses link navigation so both existing pages retain their own loading, filtering, and query-string behavior.

## Templates Access

The Templates page will no longer be restricted to workspace administrators. Any authenticated workspace user can open it through the Document Generation tab bar.

Template and partial actions will use the existing document permission model instead of administrator-role checks. Viewing follows ordinary authenticated workspace access. Create, update, and delete controls remain hidden or unavailable when the corresponding document permissions are absent. Super-admin workspace selection behavior remains unchanged.

The existing `/admin/template-partials` URL is retained to avoid route migration and broken bookmarks; its location no longer implies an administrator-only UI permission.

## Document Vault Rebrand

Update user-facing module names in the sidebar, `/processing` page heading, descriptions, and relevant existing documentation from `Document Processing` to `Document Vault`. Preserve internal filenames, service names, imports, database concepts, and the `/processing` route to keep the change presentation-only.

Historical references or technical pattern names that explicitly describe existing code identifiers may remain unchanged when renaming them would make documentation inaccurate.

## Components

Introduce a small shared Document Generation navigation component that owns the two tab labels, links, and active-route styling. Both pages render it above their page-specific content. This prevents the tab definitions and accessibility behavior from drifting.

## Testing

- Verify the sidebar displays `Document Vault`, retains `/processing`, and no longer displays the Administration `Templates` item.
- Verify both Document Generation tabs render with the correct destinations and active state.
- Verify a regular authenticated workspace user can view Templates and receives action controls according to document permissions rather than administrator status.
- Run focused component tests, type/lint checks for touched files, and relevant existing tests.

## Non-goals

- Renaming `/processing` or internal Document Processing symbols.
- Moving or rewriting the Templates page route.
- Combining Generated Documents and Templates into one page component.
- Changing template data ownership, APIs, or workspace isolation.
