# Oakcloud Documentation

> **Last Updated**: 2026-02-05
> Central navigation for all Oakcloud documentation.

---

## Quick Start

| Document | Description |
|----------|-------------|
| [Getting Started](./GETTING_STARTED.md) | Installation, setup, and first run |
| [Architecture](./ARCHITECTURE.md) | System design and tech stack |
| [README](./README.md) | Project overview and module list |

---

## Guides

Development guidelines and best practices.

| Guide | Description |
|-------|-------------|
| [RBAC Guideline](./guides/RBAC_GUIDELINE.md) | Authentication, roles, permissions, multi-tenancy |
| [Design Guideline](./guides/DESIGN_GUIDELINE.md) | UI components, styling, responsive patterns |
| [Keyboard Shortcuts](./guides/KEYBOARD_SHORTCUTS.md) | Standard shortcut mappings across modules |
| [Service Patterns](./guides/SERVICE_PATTERNS.md) | Service layer architecture and conventions |
| [Audit Logging](./guides/AUDIT_LOGGING.md) | Activity tracking and change logging |

---

## Reference

Technical reference documentation.

| Reference | Description |
|-----------|-------------|
| [Database Schema](./reference/DATABASE_SCHEMA.md) | All tables, relationships, and indexes |
| [API Reference](./reference/API_REFERENCE.md) | REST API endpoints with examples |
| [Environment Variables](./reference/ENVIRONMENT_VARIABLES.md) | Configuration options |

---

## Feature Specifications

Detailed design documents for major features.

### Document Generation
Templates, PDF export, sharing, and workflow integration.

| Document | Description |
|----------|-------------|
| [Overview](./features/document-generation/OVERVIEW.md) | Goals, architecture, key capabilities |
| [Schema](./features/document-generation/SCHEMA.md) | Database tables and relationships |
| [API](./features/document-generation/API.md) | API endpoints |
| [UI](./features/document-generation/UI.md) | UI components and patterns |
| [Implementation](./features/document-generation/IMPLEMENTATION.md) | Phases and implementation notes |

### Document Processing
AI-powered ingestion, extraction, revisions, and duplicate detection.

| Document | Description |
|----------|-------------|
| [Overview](./features/document-processing/OVERVIEW.md) | Goals, definitions, multi-tenancy |
| [Schema](./features/document-processing/SCHEMA.md) | Database tables and relationships |
| [API](./features/document-processing/API.md) | API endpoints |
| [UI](./features/document-processing/UI.md) | UI components and patterns |
| [Extraction](./features/document-processing/EXTRACTION.md) | AI extraction and classification |
| [Appendices](./features/document-processing/APPENDICES.md) | Error codes, state diagrams, validation |

---

## Other

| Document | Description |
|----------|-------------|
| [TODO / Roadmap](./TODO.md) | Known issues and planned features |
| [AI Debug](./debug/AI_DEBUG.md) | AI extraction debugging guide |

---

## For AI Assistants

When working with this codebase:

1. **Start here** - Use this index to find relevant documentation
2. **RBAC first** - Check [RBAC Guideline](./guides/RBAC_GUIDELINE.md) for permission patterns
3. **Design compliance** - Follow [Design Guideline](./guides/DESIGN_GUIDELINE.md) for UI work
4. **Service patterns** - Use [Service Patterns](./guides/SERVICE_PATTERNS.md) for backend logic
5. **Check TODO** - Review [TODO.md](./TODO.md) for known issues before implementing
