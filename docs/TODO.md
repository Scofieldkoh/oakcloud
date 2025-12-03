Instruction (Do not remove)
Remember to keep the code clean, efficient, modular and reusable. Ensure documentations are kept up to date, updating where applicable (README.md under docs; DATABASE-SCHEMA under docs, RBAC_GUIDELINE under docs, CHANGELOG.md under docs) instead of creating new documentation every time. 

you can read "README.md" inside of docs, it contains the latest information on the codebase and RBAC_GUIDELINE before implementing.

----

TO DO:

~~Phrase 1: Continue the implementation for AI vision for all model. Also, within the reusable component for AI model selector under the same container, to include a free text field that is optional for user to provide additional context to the AI model.

Phrase 2: Start implementing the full functionality of "Contact", ensure the connection with "Companies", remember to run through README.md and RBAC_GUIDELINE to ensure good and consistent code, fully functional permission, and all. Take care that each contact may be tagged to many companies, or assume many roles for one company. And plan and map the logic for creation, deletion, editing etc. like if the contact is only mapped to one company, and the company gets delete, should it cascade? what if it linked to many companies? does it remove the deleted company? what if the company get restored? etc. think of the edge case and user story when you are implementing.