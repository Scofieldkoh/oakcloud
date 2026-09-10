import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'src/components/esigning/prepare/esigning-step-upload.tsx';
let source = readFileSync(filePath, 'utf8');

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first === -1) {
    throw new Error(`${label}: expected source block was not found`);
  }
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${label}: source block was not unique`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import quick-add component',
  "import { GeneratedDocumentPicker } from './generated-document-picker';\n",
  "import { GeneratedDocumentPicker } from './generated-document-picker';\nimport { LinkedCompanySignerQuickAdd } from './linked-company-signer-quick-add';\n",
);

replaceOnce(
  'derive linked company',
  "  const hasSelectedContactEmailChanges = Boolean(\n    selectedContact && normalizeEmail(newRecipient.email) !== normalizeEmail(selectedContact.defaultEmail ?? '')\n  );\n\n  // Initialize from envelope\n",
  "  const hasSelectedContactEmailChanges = Boolean(\n    selectedContact && normalizeEmail(newRecipient.email) !== normalizeEmail(selectedContact.defaultEmail ?? '')\n  );\n  const linkedCompany = useMemo(\n    () => companies.find((company) => company.id === companyId) ?? null,\n    [companies, companyId]\n  );\n\n  // Initialize from envelope\n",
);

replaceOnce(
  'place linked company before signer selection',
  "        <div className=\"space-y-4 p-4 sm:p-5\">\n\n        {/* Self-sign row — hidden if user is already a signer */}\n",
  "        <div className=\"space-y-4 p-4 sm:p-5\">\n\n        <div className=\"space-y-2\">\n          <div>\n            <span className=\"text-xs font-medium text-text-secondary\">Linked company</span>\n            <p className=\"mt-0.5 text-xs text-text-muted\">\n              Select a company to surface its linked contacts for one-click signer selection.\n            </p>\n          </div>\n          <CompanySearchableSelect\n            companies={companies}\n            value={companyId}\n            onChange={(nextCompanyId) => {\n              setCompanyId(nextCompanyId);\n              setIsSettingsDirty(true);\n            }}\n            loading={companiesLoading}\n            disabled={!envelope.canEdit}\n            placeholder=\"Optional company link\"\n            size=\"lg\"\n          />\n        </div>\n\n        {companyId ? (\n          <LinkedCompanySignerQuickAdd\n            companyId={companyId}\n            companyName={linkedCompany?.name}\n            recipients={envelope.recipients}\n            canEdit={envelope.canEdit}\n            onAddRecipient={onAddRecipient}\n          />\n        ) : null}\n\n        {/* Self-sign row — hidden if user is already a signer */}\n",
);

replaceOnce(
  'remove linked company from settings',
  "          <div className=\"space-y-2\">\n            <span className=\"text-xs font-medium text-text-secondary\">Linked company</span>\n            <CompanySearchableSelect\n              companies={companies}\n              value={companyId}\n              onChange={(nextCompanyId) => {\n                setCompanyId(nextCompanyId);\n                setIsSettingsDirty(true);\n              }}\n              loading={companiesLoading}\n              disabled={!envelope.canEdit}\n              placeholder=\"Optional company link\"\n              size=\"lg\"\n            />\n          </div>\n\n",
  '',
);

writeFileSync(filePath, source);
