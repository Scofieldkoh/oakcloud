Instruction (Do not remove)
Remember to keep the code clean, efficient, modular and reusable. Ensure documentations are kept up to date, updating where applicable (README.md under docs; database-schema, RBAC_GUIDELINE, DESIGN_GUIDELINE under docs) instead of creating new documentation every time. 

you can read "README.md" inside of docs, it contains the latest information on the codebase, RBAC_GUIDELINE and DESIGN_GUIDELINE before implementing.

----

COMPLETED:
1. ✅ Fixed chargeType display - now hides chargeType when it matches amountSecuredText or is an amount-related term (All Monies, Fixed Sum, etc.)
2. ✅ Fixed Issued Capital extraction - now calculates and stores both paidUpCapitalAmount and issuedCapitalAmount from BizFile share capital data
3. ✅ Made "Linked" badge clickable - clicking navigates to the contact page
4. ✅ Documented BizFile contact matching - matches by ID number (NRIC/FIN/Passport) for individuals, UEN for corporates. Does NOT update existing contacts.

TO DO:
1. Add officer/shareholder management from company page (allow editing officer roles, adding new officers/shareholders)
2. When trying to delete company or contacts, if there are any active link, prompt user to confirm - warning user deleting will remove the link, but data will remain
3. Check on the RBAC, does contact gets filtered by the company/ role assignment? so person A is linked to company A, and company A's role is assigned to user, then visible/ editable/ deletable. if person A is linked to company A and company B, but only company A's role was assigned, then only can see person A with company A details/ link (and indicate no. of hidden rows). if company A and B roles are not assigned to user, then user should not see person A at all.
4. In edit mode, change "Linked" badge to "Unlink?" action and "Not Linked" to "Link Contact?" action