# Keyboard Shortcut Standards

> **Last Updated**: 2026-02-05
> **Audience**: Developers, QA

This guide documents the current keyboard shortcut standard used across Companies, Contacts, and Document Processing pages.

## Core Standard

| Shortcut | Standard Meaning |
|----------|------------------|
| `R` | Refresh current page/list data |
| `F1` | Primary action for current page (create/upload/approve) |
| `F2` | Secondary contextual action (upload/update/edit/approve-next) |
| `Esc` | Cancel or navigate back |
| `Ctrl+S` | Save or confirm in forms/workflows |
| `Ctrl+K` | Focus search input on list pages |

## Companies

| Page | Shortcuts |
|------|-----------|
| `/companies` | `R` refresh, `F1` add company, `F2` upload BizFile, `Ctrl+K` focus search |
| `/companies/new` | `Esc` cancel, `Ctrl+S` create, `F2` open BizFile upload |
| `/companies/[id]` | `Esc` back, `R` refresh, `F1` add company, `F2` update via BizFile, `E` edit |
| `/companies/[id]/edit` | `Esc` cancel, `Ctrl+S` save, `F1` add company, `F2` update via BizFile, `F3` retrieve FYE (when available) |
| `/companies/[id]/audit` | `Esc` back, `R` refresh, `F1` add company, `F2` update via BizFile |
| `/companies/upload` | `Esc` cancel/back, `F1` create company, `Ctrl+S` confirm/apply update on preview steps |

## Contacts

| Page | Shortcuts |
|------|-----------|
| `/contacts` | `R` refresh, `F1` add contact, `Ctrl+K` focus search |
| `/contacts/new` | `Esc` cancel, `Ctrl+S` create |
| `/contacts/[id]` | `Esc` back, `R` refresh, `F1` add contact, `E` edit |
| `/contacts/[id]/edit` | `Esc` cancel, `Ctrl+S` save, `F1` add contact |
| `/contacts/[id]/audit` | `Esc` back, `R` refresh, `F1` add contact |

## Document Processing

| Page | Shortcuts |
|------|-----------|
| `/processing` | `R` refresh, `F1` upload documents, `F2` approve next pending |
| `/processing/upload` | `Esc` back, `F1` upload files, `F2` merge files (`M` alias retained) |
| `/processing/[id]` | `Esc` cancel/back, `R` refresh, `F1` approve/confirm, `F2` edit, `F3` save, `F4` re-extract |

## Implementation Notes

- Always show shortcuts in button labels as `Action (Key)` where possible.
- Do not trigger page-level shortcuts while typing in input fields, except for explicit `Esc` flows.
- Keep function-key meanings stable: `F1` is primary, `F2` is secondary.
