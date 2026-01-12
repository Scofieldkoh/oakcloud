# Document Generation - UI Components

> **Last Updated**: 2025-01-12
> **Audience**: Developers

UI components and patterns for the Document Generation module.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [Design Guideline](../../guides/DESIGN_GUIDELINE.md) - UI design system

---

## Page Structure

### Templates List (`/templates`)

- **Header**: Title + "New Template" button
- **Filters**: Category dropdown, search input
- **Table**: Name, category, status, last updated, actions
- **Actions**: Edit, duplicate, delete

### Template Editor (`/templates/[id]`)

- **Left Panel**: Template settings (name, category, description)
- **Center Panel**: HTML editor with placeholder toolbar
- **Right Panel**: Placeholder list, preview
- **Bottom**: Save, preview, test generation buttons

### Documents List (`/generated-documents`)

- **Tabs**: All, Drafts, Finalized, Archived
- **Filters**: Company selector, template filter, date range
- **Table**: Title, company, template, status, created, actions
- **Bulk Actions**: Archive selected

### Document Editor (`/generated-documents/[id]`)

- **Header**: Title, status badge, action buttons
- **Editor**: Rich text editor with section navigation
- **Sidebar**:
  - Document info (company, template)
  - Section outline
  - Comments panel
  - Share settings

### Share Page (`/share/[token]`)

- **Public page** (no auth required)
- **Header**: Document title, company name
- **Navigation**: Section sidebar (sticky)
- **Content**: Document HTML with anchors
- **Footer**: Download button (if allowed), comment form
- **Password Gate**: If password-protected

---

## Key Components

### TemplateEditor

Rich text editor for template content with placeholder support.

```tsx
<TemplateEditor
  value={content}
  onChange={setContent}
  placeholders={availablePlaceholders}
  onInsertPlaceholder={(p) => insertAtCursor(p)}
/>
```

**Features:**
- Syntax highlighting for placeholders
- Placeholder autocomplete (type `{{`)
- Live preview toggle
- Page break insertion

### PlaceholderToolbar

Toolbar for inserting placeholders into templates.

```tsx
<PlaceholderToolbar
  categories={['company', 'contact', 'date', 'custom']}
  onInsert={(placeholder) => editor.insertText(placeholder)}
/>
```

### DocumentPreview

Live preview of generated document.

```tsx
<DocumentPreview
  content={renderedContent}
  showLetterhead={useLetterhead}
  sections={sections}
/>
```

### ShareDialog

Modal for creating share links.

```tsx
<ShareDialog
  documentId={id}
  onShare={(shareUrl) => copyToClipboard(shareUrl)}
/>
```

**Options:**
- Expiration time
- Password protection
- Allowed actions (view, download, print)
- Allow comments

### CommentsSidebar

Comment thread for document review.

```tsx
<CommentsSidebar
  documentId={id}
  comments={comments}
  onAddComment={handleAdd}
  onResolve={handleResolve}
/>
```

### SectionNavigation

Sticky sidebar for document sections.

```tsx
<SectionNavigation
  sections={sections}
  activeSection={currentSection}
  onNavigate={(anchor) => scrollToAnchor(anchor)}
/>
```

---

## Placeholder System

### Syntax

Placeholders use double curly braces:
```
{{company.name}}
{{contact.fullName}}
{{date.today | format:"MMMM d, yyyy"}}
```

### Available Placeholders

| Category | Placeholders |
|----------|-------------|
| **company** | name, uen, registeredAddress, incorporationDate, entityType, status |
| **officers** | directors[], secretary, ceo |
| **shareholders** | list[], totalShares |
| **contact** | fullName, email, phone, address |
| **date** | today, currentYear, currentMonth |
| **custom** | User-defined during generation |

### Filters

```
{{company.name | uppercase}}
{{date.today | format:"dd MMM yyyy"}}
{{amount | currency}}
{{list | join:", "}}
```

---

## PDF Export Options

### Page Settings

```tsx
<PDFExportDialog
  documentId={id}
  options={{
    pageSize: 'A4',       // A4, Letter, Legal
    orientation: 'portrait',
    includeLetterhead: true,
    includePageNumbers: true,
    pageNumberPosition: 'bottom-center'
  }}
/>
```

### Letterhead Preview

```tsx
<LetterheadPreview
  header={letterhead.headerHtml}
  footer={letterhead.footerHtml}
  margins={letterhead.pageMargins}
/>
```

---

## Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Desktop (>1024px) | Full layout with sidebars |
| Tablet (768-1024px) | Collapsible sidebars |
| Mobile (<768px) | Single column, floating action buttons |

### Mobile Adaptations

- Template editor: Full-screen mode
- Document preview: Bottom sheet
- Comments: Slide-up panel
- Share page: Simplified navigation

---

## Accessibility

- All form inputs labeled
- Keyboard navigation for editor
- Focus management in dialogs
- Screen reader support for document structure
- High contrast mode support

---

## Loading States

```tsx
// Document loading
<DocumentSkeleton />

// Template list loading
<TemplateListSkeleton count={5} />

// PDF generation progress
<ExportProgress
  status="generating"
  progress={65}
  message="Rendering page 3 of 5..."
/>
```

---

## Error States

```tsx
// Template not found
<EmptyState
  icon={FileX}
  title="Template not found"
  description="The template may have been deleted"
  action={<Button onClick={goToTemplates}>View Templates</Button>}
/>

// Share link expired
<ShareExpired
  message="This share link has expired"
  contactEmail={ownerEmail}
/>

// Validation errors
<ValidationErrors
  errors={missingData}
  onFix={(field) => navigateToFix(field)}
/>
```
