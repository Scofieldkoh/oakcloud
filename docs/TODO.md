Instruction (Do not remove)
Remember to keep the code clean, efficient, modular and reusable. Ensure documentations are kept up to date, updating where applicable (README.md under docs; database-schema, RBAC_GUIDELINE, DESIGN_GUIDELINE under docs) instead of creating new documentation every time.

you can read "README.md" inside of docs, it contains the latest information on the codebase, RBAC_GUIDELINE and DESIGN_GUIDELINE before implementing.

----

COMPLETED:
1. Added filters to Company detail page for Officers section (name, role, show ceased)
2. Added filters to Company detail page for Shareholders section (name, show former)
3. Validated cessation date cannot be earlier than appointment date in officer edit modal
4. Added "show ceased" checkbox defaulted to FALSE in both contact and company detail pages
5. Fixed checkbox vertical alignment with h-[26px] container
6. Added Edit button (pencil icon) for officers and shareholders on Company detail page
7. Added Edit Officer modal (appointment date, cessation date)
8. Added Edit Shareholder modal (number of shares, share class)
9. Fixed SUPER_ADMIN tenant context error when editing officers/shareholders
10. Added delete button (rubbish bin) next to edit button for officers/shareholders on company detail page
11. Replaced text "Edit" and "Remove" buttons with pencil and rubbish bin icons in contact page company relationships
12. Updated shareholder percentage calculation when editing number of shares (all shareholders' percentages recalculated)
13. Deprecated "Link Contacts" mode and removed the button from company detail page
14. Changed rubbish bin button to remove (mark as ceased/former) instead of just unlinking
15. Remove functionality now works consistently from both company and contact pages
16. Company detail page now displays officer/shareholder address and nationality from linked Contact (contact data takes priority, fallback to officer/shareholder data if no contact linked)
17. Simplified Contact address schema - removed alternatePhone, addressLine2, postalCode, city, country; replaced with single fullAddress field
18. Made email optional for contacts (not a mandatory field)
19. Contact detail page summary now excludes ceased appointments (filters by isCurrent)

Note: To edit officer/shareholder details, use the pencil icon.
To remove officers/shareholders (marks them as ceased/former), use the rubbish bin icon.
Officer/shareholder address and nationality are now sourced from the linked Contact record.

TO DO:
1.
