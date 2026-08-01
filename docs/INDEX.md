# Oakcloud Documentation

> **Last Updated**: 2026-07-27
> Central navigation for the current Oakcloud documentation set.

## Quick Start

| Document | Description |
|----------|-------------|
| [Getting Started](./GETTING_STARTED.md) | Local setup, data services, and first run |
| [Architecture](./ARCHITECTURE.md) | Runtime design, modules, and service layout |
| [README](./README.md) | Project overview and implemented modules |

## Tasks And Pipelines

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md#tasks-and-pipelines-architecture) | Versioned pipeline snapshots, lifecycle, stage-action adapters, and module integrations |
| [API Reference](./reference/API_REFERENCE.md#tasks-and-pipelines-endpoints) | Tenant-scoped pipeline, task, stage, and transition routes |
| [Database Schema](./reference/DATABASE_SCHEMA.md#tasks-and-pipelines-module-tables) | Task tables, enums, status rules, immutable snapshots, and legacy reset |

## Guides

| Guide | Description |
|-------|-------------|
| [RBAC Guideline](./guides/RBAC_GUIDELINE.md) | Authentication, roles, permissions, multi-tenancy |
| [Design Guideline](./guides/DESIGN_GUIDELINE.md) | UI components, styling, responsive patterns |
| [Keyboard Shortcuts](./guides/KEYBOARD_SHORTCUTS.md) | Shared shortcut mappings across modules |
| [Service Patterns](./guides/SERVICE_PATTERNS.md) | Service-layer architecture and conventions |
| [Staging & Deployment](./guides/STAGING_DEPLOYMENT.md) | Two-environment workflow for self-hosted Docker deployments |
| [Audit Logging](./guides/AUDIT_LOGGING.md) | Activity tracking and change logging |

## Reference

| Reference | Description |
|-----------|-------------|
| [Database Schema](./reference/DATABASE_SCHEMA.md) | Tables, relationships, indexes, enums, [Tasks and Pipelines](./reference/DATABASE_SCHEMA.md#tasks-and-pipelines-module-tables), and contact identity operations |
| [API Reference](./reference/API_REFERENCE.md) | Authenticated and public API routes, including [Tasks and Pipelines](./reference/API_REFERENCE.md#tasks-and-pipelines-endpoints) and contact matching |
| [Environment Variables](./reference/ENVIRONMENT_VARIABLES.md) | Runtime and deployment configuration |

## Feature Specifications

| Document | Description |
|----------|-------------|
| [AI Helpbot Specification](./features/ai-helpbot/SPECIFICATION.md) | Current feature specification under `docs/features/` |

## Forms Rollout Docs

The Forms module does not yet have a single stable spec file under `docs/features/`. The current implementation history lives in these rollout docs:

| Document | Description |
|----------|-------------|
| [Forms Improvements](./plans/2026-03-04-forms-improvements.md) | Main implementation plan for the Forms module |
| [Form Submission PDF Redesign](./plans/2026-03-09-form-submission-pdf-redesign.md) | HTML-to-PDF export for form responses |
| [Resume Draft UI Implementation](./plans/2026-03-09-resume-draft-ui-implementation.md) | Public draft resume and email flow |
| [Forms Implementation Review](./plans/2026-03-10-forms-implementation-review.md) | Security, performance, and logic review |
| [Forms API: option presets](./reference/API_REFERENCE.md#get-apiformspresets) | Managed CSV dropdown lists, protected built-ins, limits, and live form linkage |
| [Forms design: option presets](./guides/DESIGN_GUIDELINE.md#form-option-presets) | Preset manager and respondent dropdown interaction rules |

## Other

| Document | Description |
|----------|-------------|
| [TODO / Roadmap](./TODO.md) | Known issues, roadmap, and completed work |
| [AI Debug](./debug/AI_DEBUG.md) | AI debugging guide, including form review traces |

## For AI Assistants

When working in this repo:

1. Start with this index.
2. Check [RBAC Guideline](./guides/RBAC_GUIDELINE.md) before changing protected routes or permissions.
3. Use [Service Patterns](./guides/SERVICE_PATTERNS.md) for backend work and [Design Guideline](./guides/DESIGN_GUIDELINE.md) for UI changes.
4. Use the Forms rollout docs above for historical implementation context until a dedicated Forms feature spec exists.
