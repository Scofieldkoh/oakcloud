# AI Debug Log

> **Last Updated**: 2025-01-12
> **Audience**: Developers

This file contains debug logs for AI extraction calls when `AI_DEBUG=true`.

## Related Documents

- [Document Processing / Extraction](../features/document-processing/EXTRACTION.md) - AI extraction details
- [Environment Variables](../reference/ENVIRONMENT_VARIABLES.md) - Configuration options

## How to Enable Debug Logging

Set the following environment variable in your `.env` file:

```bash
AI_DEBUG=true
```

When enabled, the system automatically appends detailed AI call logs to **this file** (`docs/AI_DEBUG.md`).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_DEBUG` | `false` | Enable AI debug logging to this file |
| `AI_DEBUG_LOG_PROMPTS` | `true` | Include full prompts in logs |
| `AI_DEBUG_LOG_RESPONSES` | `true` | Include full AI responses in logs |
| `AI_DEBUG_LOG_IMAGES` | `false` | Include image metadata in logs |

## Log Format

Each AI call logs:
1. **Request Details** - Model, provider, operation, tenant, temperature, COA context
2. **Prompt** - Full extraction prompt (collapsible)
3. **Response** - Status, latency, token counts, estimated cost, raw response (collapsible)
4. **Extraction Results** - Document fields and line item account codes

## Troubleshooting Account Code Assignment

### Common Issues

1. **No account code assigned** (`❌ NOT ASSIGNED`)
   - Check if COA context was included (look for `COA Context: Yes`)
   - Verify tenant has chart of accounts configured in 4xxx-8xxx range
   - Review the prompt to ensure accounts are listed

2. **Wrong account code assigned**
   - Check the AI response for the `accountCode` field
   - Review the description and compare to available accounts
   - Consider adding more specific accounts to COA

3. **Low confidence scores** (< 0.7)
   - AI is uncertain about the mapping
   - Review the line item description for clarity
   - Consider manual assignment for edge cases

### Expected Account Code Ranges

- **4xxx**: Revenue accounts (sales, service income)
- **5xxx**: Cost of goods sold (direct costs, purchases)
- **6xxx-7xxx**: Operating expenses (admin, marketing, utilities)
- **8xxx**: Tax expenses (income tax, deferred tax)

## Clearing Logs

To clear this log file, you can:
1. Delete everything below the `---` line manually
2. Or use the `clearDebugLog()` function programmatically

---
## AI Request - 2026-03-10T07:55:15.078Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_attachment_check |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 148976ms |
| Input Tokens | 1042 |
| Output Tokens | 1846 |
| Total Tokens | 2888 |
| Estimated Cost | $0.0047 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1911 chars)</summary>

```json
{
  "summary": "The single attached document (front and back of a Singapore NRIC) is readable; key fields such as name, ID number, date of birth, nationality, address and issue date are visibly legible on the image.",
  "attachments": [
    {
      "attachmentIndex": 1,
      "fileName": "SPR NRIC_Amy Chew.pdf",
      "fieldKey": null,
      "fieldLabel": null,
      "readability": "clear",
      "documentType": "Singapore NRIC",
      "visibleTextSummary": "Front and back of a Singapore NRIC for AMY CHEW XING MEI. The card number (NRIC), full name, Chinese name, race (Chinese), sex (F), date of birth, country/place of birth (Malaysia), nationality, address, and date of issue are visible.",
      "extractedFields": [
        {
          "label": "full_name",
          "value": "AMY CHEW XING MEI"
        },
        {
          "label": "id_number",
          "value": "S90838671"
        },
        {
          "label": "date_of_birth",
          "value": "14-04-1990"
        },
        {
          "label": "nationality",
          "value": "MALAYSIAN"
        },
        {
          "label": "race",
          "value": "CHINESE"
        },
        {
          "label": "sex",
          "value": "F"
        },
        {
          "label": "address",
          "value": "APT BLK 709 PASIR RIS DRIVE 10 #13-177 SINGAPORE 510708"
        },
        {
          "label": "date_of_issue",
          "value": "24-05-2018"
        }
      ],
      "notes": [
        "The NRIC number is printed as 'S90838671' on the card image; this is taken exactly as visible.",
        "The card shows additional printed date '15/05/2020' near the bottom on the back (visible) but its exact meaning/label is not explicit on the image.",
        "No expiry date is visible on the provided image.",
        "Chinese characters for the name and a photograph and fingerprint on the card are visible."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-03-10T08:18:33.465Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 26655ms |
| Input Tokens | 3946 |
| Output Tokens | 1958 |
| Total Tokens | 5904 |
| Estimated Cost | $0.0079 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2189 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "high",
  "summary": "PEP declared with no position detail and respondent refuses to disclose involvement in proceedings — requires EDD and escalation.",
  "tags": [
    "pep",
    "requires-EDD",
    "undisclosed-proceeding"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "Politically Exposed Person declared (field: politically_exposed_person_pep_status = 'I AM a Politically Exposed Person.'). Position field (field: position) = 'NA' and no supporting detail provided; Cannot verify: nature/level of PEP relationship.",
        "Involvement in civil/regulatory proceedings indicated (field: proceeding_check = 'Yes') with proceeding_check_detail = 'Refuse to disclose'; Cannot verify: details of civil/regulatory proceedings (field: proceeding_check_detail).",
        "Supporting document provided (attachment: 'NRIC - Amy Chew Xing Mei - 10 Mar 26.pdf') and NRIC number in form (field: nric_fin_passport_number = 'S9083867I') matches the attachment, but authenticity of the NRIC cannot be verified from the submitted file alone; Cannot verify: authenticity of NRIC document."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Request full disclosure of PEP details (field: position) including official title, office held, dates of service and relationship type (self, close associate, family). Request supporting evidence (e.g., appointment letter, official ID, public office record).",
        "Request complete details and supporting documents about the civil/regulatory proceedings (field: proceeding_check_detail). If the respondent refuses to provide information, escalate to compliance/EDD.",
        "Place onboarding on hold and escalate file to Compliance for enhanced due diligence due to declared PEP status combined with undisclosed proceedings.",
        "Verify the submitted NRIC file ('NRIC - Amy Chew Xing Mei - 10 Mar 26.pdf') via visual inspection for signs of alteration and request a certified or higher-resolution copy if any doubt about legibility or integrity remains."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-03-10T08:20:40.731Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 25500ms |
| Input Tokens | 3961 |
| Output Tokens | 1762 |
| Total Tokens | 5723 |
| Estimated Cost | $0.0075 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2132 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "high",
  "summary": "PEP declared and civil/regulatory proceedings indicated but details withheld; Singapore NRIC attached — escalate for EDD and obtain clarifying documentation.",
  "tags": [
    "pep",
    "undisclosed-proceeding",
    "id-provided"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "Politically Exposed Person declared in field 'politically_exposed_person_pep_status' = 'I AM a Politically Exposed Person.' but no position provided in field 'position' (value = 'NA') — Cannot verify: PEP status/role ('politically_exposed_person_pep_status' / 'position').",
        "Involved in civil or regulatory proceedings indicated in field 'proceeding_check' = 'Yes' but 'proceeding_check_detail' = 'Refuse to disclose' — Cannot verify: nature/outcome of proceedings ('proceeding_check_detail').",
        "Identity document attached: 'NRIC - Amy Chew Xing Mei - 10 Mar 26.pdf' (field 'nric') — presence confirmed but PEP and proceeding claims require independent verification despite NRIC being provided."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Request full disclosure of the civil/regulatory proceedings: provide a written summary, case numbers, jurisdiction, current status, and relevant court/regulatory documents (relating to 'proceeding_check' / 'proceeding_check_detail').",
        "Request clarification and supporting evidence for PEP status: specify position/title, institution, dates of service, and official documentation evidencing PEP status (relating to 'politically_exposed_person_pep_status' and 'position').",
        "Hold onboarding pending receipt and review of the requested documents and supporting evidence; place file for compliance review/EDD due to PEP + undisclosed proceedings.",
        "If documents are provided, escalate to compliance/EDD team for risk assessment; if applicant continues to refuse disclosure, consider rejecting onboarding or applying heightened measures per CSP policy."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-03-10T08:43:33.128Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 296207ms |
| Input Tokens | 4046 |
| Output Tokens | 2032 |
| Total Tokens | 6078 |
| Estimated Cost | $0.0081 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1916 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "high",
  "summary": "PEP declared with undisclosed proceedings and unclear ID validity — escalate to EDD and obtain missing details.",
  "tags": [
    "pep",
    "requires-EDD",
    "doc-uncertain"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "Politically Exposed Person indicated (politically_exposed_person_pep_status = \"I AM a Politically Exposed Person.\") but Position field (position) is \"NA\" — missing material PEP role details and source of authority.",
        "Proceeding check (proceeding_check) answered \"Yes\" but proceeding_check_detail = \"Refuse to disclose\" — Cannot verify: details of civil/regulatory proceedings.",
        "Attachment \"NRIC - Amy Chew Xing Mei - 10 Mar 26.pdf\" (supporting_documents) displays a date \"15/05/2020\" that may indicate issue/expiry information — Cannot verify: whether the NRIC is currently valid."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Request full PEP information (position/title, role description, dates in office, and appointing authority or official documentation) referencing politically_exposed_person_pep_status and position.",
        "Request full disclosure and supporting documents for the civil/regulatory proceedings (case reference, regulator/court name, status and outcome) referencing proceeding_check and proceeding_check_detail.",
        "Request a clear, dated copy of a current valid photo ID (NRIC front/back showing expiry or a valid passport) to confirm identity and document validity; reference attachment \"NRIC - Amy Chew Xing Mei - 10 Mar 26.pdf\".",
        "Escalate the file to Compliance/EDD for enhanced due diligence and hold onboarding or account activation pending satisfactory responses and document verification."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-03-10T08:50:11.165Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 60034ms |
| Input Tokens | 4060 |
| Output Tokens | 2660 |
| Total Tokens | 6720 |
| Estimated Cost | $0.0094 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2462 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "high",
  "summary": "Applicant declared PEP status and a civil/regulatory proceeding but provided no position details and refused to disclose proceeding details; identity document attached requires verification.",
  "tags": [
    "pep-declared",
    "missing-info",
    "requires-EDD"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "Politically Exposed Person declared (field: politically_exposed_person_pep_status = 'I AM a Politically Exposed Person.') but no substantive position provided (field: position = 'NA') — missing PEP office/title and dates.",
        "Cannot verify: Politically Exposed Person status (politically_exposed_person_pep_status) from the submitted supporting document 'NRIC - Amy Chew Xing Mei - 10 Mar 26.pdf'.",
        "Civil/regulatory proceeding indicated (field: proceeding_check = 'Yes') but proceeding_check_detail = 'Refuse to disclose' — Cannot verify nature, status, or outcome of the proceeding (field: proceeding_check_detail).",
        "Cannot verify: NRIC number in form (field: nric_fin_passport_number = 'S9083867I') against the attached file 'NRIC - Amy Chew Xing Mei - 10 Mar 26.pdf' (attachment requires manual confirmation of number and readability)."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Request full PEP information: official position title, office/institution, term dates, and documentary evidence (appointment letter, public record) for field politically_exposed_person_pep_status and pep_country.",
        "Request detailed information and supporting documentation regarding the civil/regulatory proceeding (court/agency documents, outcome/status). If the respondent refuses to disclose, escalate to compliance for guidance and consider requesting a signed explanation/waiver.",
        "Manually verify identity: compare form field nric_fin_passport_number ('S9083867I') with the attached 'NRIC - Amy Chew Xing Mei - 10 Mar 26.pdf'; request a clearer re-scan if any part of the NRIC is unreadable or does not match.",
        "Place onboarding on hold and escalate to Enhanced Due Diligence (EDD) / compliance due to declared PEP status combined with undisclosed regulatory proceeding.",
        "After receipt of requested documents, reassess risk and document findings in the file before proceeding."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-03-10T09:55:21.482Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 27170ms |
| Input Tokens | 16421 |
| Output Tokens | 2064 |
| Total Tokens | 18485 |
| Estimated Cost | $0.0205 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1712 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "medium",
  "summary": "Name mismatch on declaration, Singapore NRIC attachment not verifiable from submission, and overseas residential address requires clarification/proof.",
  "tags": [
    "name-mismatch",
    "foreign-address",
    "doc-unverified"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "Mismatch between 'full_name' (Wei Jie Tan) and declaration field 'full_name_declaration' (Wei Jie).",
        "Residential address (residential_address) is 'Mumbai India' while supporting document is a Singapore NRIC (attachment 'NRIC - Wei Jie Tan - 8 Mar 26.pdf'); residential status and proof of address unclear.",
        "Cannot verify: NRIC - Wei Jie Tan - 8 Mar 26.pdf matches form fields (name, NRIC number S9101817I, date_of_birth 1986-03-03)."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Request a clear, certified copy of the NRIC (front and back) and verify name, NRIC number and DOB against the form (reference file 'NRIC - Wei Jie Tan - 8 Mar 26.pdf').",
        "Ask respondent to confirm residential status (Singapore resident or overseas) and provide recent proof of address (utility bill or bank statement dated within 3 months) showing full street address.",
        "Request the respondent re-sign the declaration using their full legal name matching the NRIC or provide a signed explanation for the name difference.",
        "Hold onboarding / account activation pending receipt and verification of the documents above; escalate to EDD if identity or address discrepancies are not resolved."
      ]
    }
  ]
}
```
</details>

---

