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
## AI Request - 2026-04-15T01:29:49.394Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 8704ms |
| Input Tokens | 7965 |
| Output Tokens | 627 |
| Total Tokens | 8592 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0088 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1932 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.98
  },
  "vendorName": {
    "value": "INGENIQUE SOLUTIONS PTE. LTD.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Oaktree Accounting & Corporate Solutions Pte Ltd",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "1711131",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-03-23",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-03-23",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "1700.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "153.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "1853.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201400612Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "PSG Package 1 SentroWeb-Regular 500 cloud computing software as a service (License) - Customer Due Diligence Module - AML/CFT search and report - record keeping and retrieval of past searches - automated ongoing monitoring - up to 5 user login - up to 500 unique name searches per year - Acuris AML/CFT data",
        "confidence": 0.96
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "1700.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "1700.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "153.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6920",
        "confidence": 0.89
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-04-15T01:29:58.114Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.98 |
| Vendor | INGENIQUE SOLUTIONS PTE. LTD. | 0.99 |
| Total Amount | 1853.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6920 | 0.89 | PSG Package 1 SentroWeb-Regular 500 cloud compu... |

---

## AI Request - 2026-04-15T04:09:59.942Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 3965ms |
| Input Tokens | 6498 |
| Output Tokens | 254 |
| Total Tokens | 6752 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (902 chars)</summary>

```json
{
  "documentCategory": {
    "value": "CORRESPONDENCE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "MESSAGE",
    "confidence": 0.94
  },
  "vendorName": {
    "value": "AOS Bath",
    "confidence": 0.97
  },
  "customerName": null,
  "documentNumber": null,
  "documentDate": null,
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 0.9
  },
  "subtotal": {
    "value": "176.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "null",
    "confidence": 0
  },
  "totalAmount": {
    "value": "176.00",
    "confidence": 0.95
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Water heater maintenance (tank flush, safety check, 1-hour service)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "176.00",
        "confidence": 0.93
      },
      "amount": {
        "value": "176.00",
        "confidence": 0.95
      },
      "gstAmount": null,
      "taxCode": {
        "value": "NA",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.72
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-04-15T04:10:03.922Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | CORRESPONDENCE | 0.98 |
| Vendor | AOS Bath | 0.97 |
| Total Amount | 176.00 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6800 | 0.72 | Water heater maintenance (tank flush, safety ch... |

---

## AI Request - 2026-04-15T04:10:27.735Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 14585ms |
| Input Tokens | 6741 |
| Output Tokens | 513 |
| Total Tokens | 7254 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0074 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1524 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.99
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.99
  },
  "vendorName": {
    "value": "Accounting and Corporate Regulatory Authority (ACRA)",
    "confidence": 0.98
  },
  "customerName": null,
  "documentNumber": {
    "value": "ACRA260415001428",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-04-15",
    "confidence": 0.99
  },
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "5.05",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.45",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "5.50",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "M9-0008879-T",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Business Profile (Co)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "5.05",
        "confidence": 0.99
      },
      "amount": {
        "value": "5.05",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.45",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7810",
        "confidence": 0.86
      }
    }
  ],
  "overallConfidence": 0.99
}
```
</details>

---

## Extraction Results - 2026-04-15T04:10:42.330Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.99 |
| Vendor | Accounting and Corporate Regulatory Authority (ACRA) | 0.98 |
| Total Amount | 5.50 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7810 | 0.86 | Business Profile (Co) |

---

## AI Request - 2026-04-15T05:45:09.284Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 5201ms |
| Input Tokens | 6503 |
| Output Tokens | 546 |
| Total Tokens | 7049 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0073 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1588 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.99
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.98
  },
  "vendorName": {
    "value": "VistaPrint B.V.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Zhi Yong Koh",
    "confidence": 0.98
  },
  "documentNumber": {
    "value": "0235653641",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-04-15",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "USD",
    "confidence": 0.9
  },
  "subtotal": {
    "value": "69.99",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "7.12",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "86.28",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "NL812139513B01",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Aluminium Signs",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "69.99",
        "confidence": 0.99
      },
      "amount": {
        "value": "69.99",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "6.30",
        "confidence": 0.7
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.75
      },
      "accountCode": {
        "value": "6120",
        "confidence": 0.84
      }
    }
  ],
  "overallConfidence": 0.96
}
```
</details>

---

## Extraction Results - 2026-04-15T05:45:14.495Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | VistaPrint B.V. | 0.99 |
| Total Amount | 86.28 USD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6120 | 0.84 | Aluminium Signs |

---

## AI Request - 2026-04-17T08:07:29.216Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 5509ms |
| Input Tokens | 7278 |
| Output Tokens | 443 |
| Total Tokens | 7721 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0075 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1502 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.98
  },
  "vendorName": {
    "value": "BEE & DEE PTE. LTD.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD Carwash Pte. Ltd.",
    "confidence": 0.98
  },
  "documentNumber": {
    "value": "14",
    "confidence": 0.97
  },
  "documentDate": {
    "value": "2026-03-24",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-07",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "264.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "23.76",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "287.76",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202503947N",
    "confidence": 0.96
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Maxshine Synthetic Wool Cutting Pad 6",
        "confidence": 0.95
      },
      "quantity": {
        "value": "6",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "20.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "120.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "10.80",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.78
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Lake Country MF-525 CUT Microfiber Cutting Fiber Pad Blue Foam",
        "confidence": 0.95
      },
      "quantity": {
        "value": "6",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "24.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "144.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "12.96",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.78
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:34.738Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.98 |
| Vendor | BEE & DEE PTE. LTD. | 0.99 |
| Total Amount | 287.76 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 5210 | 0.78 | Maxshine Synthetic Wool Cutting Pad 6 |
| 2 | 5210 | 0.78 | Lake Country MF-525 CUT Microfiber Cutting Fibe... |

---

## AI Request - 2026-04-17T08:07:27.788Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7062ms |
| Input Tokens | 7022 |
| Output Tokens | 717 |
| Total Tokens | 7739 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0085 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2161 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "PHOENIX COMMERCIAL PTE LTD",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "A115995",
    "confidence": 0.97
  },
  "documentDate": {
    "value": "2026-03-23",
    "confidence": 0.98
  },
  "dueDate": {
    "value": "2026-04-06",
    "confidence": 0.98
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "151.16",
    "confidence": 0.97
  },
  "taxAmount": {
    "value": "13.60",
    "confidence": 0.97
  },
  "totalAmount": {
    "value": "164.76",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201805800K",
    "confidence": 0.93
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Electricity Charges",
        "confidence": 0.96
      },
      "quantity": {
        "value": "643.18",
        "confidence": 0.93
      },
      "unitPrice": {
        "value": "0.19459",
        "confidence": 0.92
      },
      "amount": {
        "value": "125.16",
        "confidence": 0.97
      },
      "gstAmount": {
        "value": "11.26",
        "confidence": 0.94
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.98
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.96
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Admin Fee",
        "confidence": 0.97
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "26.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "26.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "2.34",
        "confidence": 0.94
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.98
      },
      "accountCode": {
        "value": "7801",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.96
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:34.860Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | PHOENIX COMMERCIAL PTE LTD | 0.99 |
| Total Amount | 164.76 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7110 | 0.96 | Electricity Charges |
| 2 | 7801 | 0.80 | Admin Fee |

---

## AI Request - 2026-04-17T08:07:26.301Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 9057ms |
| Input Tokens | 7278 |
| Output Tokens | 962 |
| Total Tokens | 8240 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0098 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2960 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.98
  },
  "vendorName": {
    "value": "Oaktree Accounting & Corporate Solutions Pte. Ltd.",
    "confidence": 0.97
  },
  "customerName": {
    "value": "GD Cashwash Pte. Ltd.",
    "confidence": 0.96
  },
  "documentNumber": {
    "value": "INV-1000000292",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-03-12",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-03-26",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "600.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "600.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": null,
    "confidence": 0.1
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "ACC-MTH, Monthly account services (Period: Feb 2026)",
        "confidence": 0.98
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "300.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "300.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6610",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "PAY-MTH, Monthly payroll services (Period: Feb 2026)",
        "confidence": 0.98
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "180.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "180.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6610",
        "confidence": 0.86
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "PAY-FRM, IR21 Filing (Employee: Devan)",
        "confidence": 0.97
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "120.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "120.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6660",
        "confidence": 0.72
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:35.367Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Oaktree Accounting & Corporate Solutions Pte. Ltd. | 0.97 |
| Total Amount | 600.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6610 | 0.90 | ACC-MTH, Monthly account services (Period: Feb ... |
| 2 | 6610 | 0.86 | PAY-MTH, Monthly payroll services (Period: Feb ... |
| 3 | 6660 | 0.72 | PAY-FRM, IR21 Filing (Employee: Devan) |

---

## AI Request - 2026-04-17T08:07:31.110Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 4699ms |
| Input Tokens | 7518 |
| Output Tokens | 553 |
| Total Tokens | 8071 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0081 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1633 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.99
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.99
  },
  "vendorName": {
    "value": "Oaktree Accounting & Corporate Solutions Pte Ltd",
    "confidence": 0.98
  },
  "customerName": {
    "value": "GD Cashwash Pte. Ltd.",
    "confidence": 0.98
  },
  "documentNumber": {
    "value": "INV-1000000314",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-03-30",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-13",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "500.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "500.00",
    "confidence": 0.99
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "TAX-COR, Corporate Tax Filing (ECI Inclusive) Period: YA2026",
        "confidence": 0.98
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "500.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "500.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6660",
        "confidence": 0.86
      }
    }
  ],
  "overallConfidence": 0.99
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:35.819Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | Oaktree Accounting & Corporate Solutions Pte Ltd | 0.98 |
| Total Amount | 500.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6660 | 0.86 | TAX-COR, Corporate Tax Filing (ECI Inclusive) P... |

---

## AI Request - 2026-04-17T08:07:34.344Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 3517ms |
| Input Tokens | 6498 |
| Output Tokens | 336 |
| Total Tokens | 6834 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0064 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1103 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.96
  },
  "vendorName": {
    "value": "SP Group",
    "confidence": 0.98
  },
  "customerName": {
    "value": "GD Carwash Pte. Ltd.",
    "confidence": 0.93
  },
  "documentNumber": {
    "value": "8955870749",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-03-29",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-13",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "24.58",
    "confidence": 0.97
  },
  "taxAmount": {
    "value": "2.22",
    "confidence": 0.97
  },
  "totalAmount": {
    "value": "26.80",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "M2-8920920-4",
    "confidence": 0.78
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Water Services (usage estimated 7.6 Cu M)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "7.6",
        "confidence": 0.93
      },
      "unitPrice": {
        "value": "3.23",
        "confidence": 0.82
      },
      "amount": {
        "value": "24.58",
        "confidence": 0.98
      },
      "gstAmount": {
        "value": "2.22",
        "confidence": 0.97
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7120",
        "confidence": 0.9
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:37.870Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.98 |
| Vendor | SP Group | 0.98 |
| Total Amount | 26.80 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7120 | 0.90 | Water Services (usage estimated 7.6 Cu M) |

---

## AI Request - 2026-04-17T08:07:35.987Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 4370ms |
| Input Tokens | 7278 |
| Output Tokens | 470 |
| Total Tokens | 7748 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0076 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1422 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.93
  },
  "vendorName": {
    "value": "Inland Revenue Authority of Singapore",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "202510716E",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-03-30",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-09",
    "confidence": 0.98
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": null,
  "taxAmount": null,
  "totalAmount": {
    "value": "406.34",
    "confidence": 0.99
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Tax payment directive amount",
        "confidence": 0.92
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "406.34",
        "confidence": 0.99
      },
      "amount": {
        "value": "406.34",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.98
      },
      "accountCode": {
        "value": "7801",
        "confidence": 0.78
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:40.366Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.98 |
| Vendor | Inland Revenue Authority of Singapore | 0.99 |
| Total Amount | 406.34 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7801 | 0.78 | Tax payment directive amount |

---

## AI Request - 2026-04-17T08:07:38.677Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 3185ms |
| Input Tokens | 7188 |
| Output Tokens | 327 |
| Total Tokens | 7515 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0069 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1090 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.99
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.98
  },
  "vendorName": {
    "value": "BEE & DEE PTE. LTD.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD Carwash Pte. Ltd.",
    "confidence": 0.98
  },
  "documentNumber": {
    "value": "17",
    "confidence": 0.97
  },
  "documentDate": {
    "value": "2026-04-07",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-21",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "35.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "3.15",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "38.15",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202503947N",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "14kg Ariel Washing Powder",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "35.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "35.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "3.15",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.72
      }
    }
  ],
  "overallConfidence": 0.99
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:41.872Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | BEE & DEE PTE. LTD. | 0.99 |
| Total Amount | 38.15 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 5210 | 0.72 | 14kg Ariel Washing Powder |

---

## AI Request - 2026-04-17T08:07:32.716Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 9181ms |
| Input Tokens | 7278 |
| Output Tokens | 1543 |
| Total Tokens | 8821 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0124 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (4827 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.99
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.98
  },
  "vendorName": {
    "value": "BEE & DEE PTE. LTD.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD Carwash Pte. Ltd.",
    "confidence": 0.98
  },
  "documentNumber": {
    "value": "15",
    "confidence": 0.96
  },
  "documentDate": {
    "value": "2026-03-27",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-10",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "248.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "22.32",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "270.32",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202503947N",
    "confidence": 0.98
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Shine Mate 7 Foam Pad Flat Face Green Art 34127-9",
        "confidence": 0.98
      },
      "quantity": {
        "value": "4",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "15.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "60.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "5.40",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.72
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Shine Mate 6 Foam Pad Flat Face Green Art 34126-9",
        "confidence": 0.98
      },
      "quantity": {
        "value": "6",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "11.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "66.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "5.94",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.72
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Shine Mate 6 Foam Pad Flat Face Yellow Art 34126-1",
        "confidence": 0.98
      },
      "quantity": {
        "value": "6",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "11.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "66.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "5.94",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.72
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "Shine Mate 6 Foam Pad Flat Face Red Art 34126-7",
        "confidence": 0.98
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "11.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "11.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.99",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.72
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "Bodyguard Wheel Brush with Interchangeable Cover WBR02-C",
        "confidence": 0.98
      },
      "quantity": {
        "value": "2",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "15.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "30.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "2.70",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.72
      }
    },
    {
      "lineNo": 6,
      "description": {
        "value": "20 litre Hand Pump",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "15.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "15.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "1.35",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.72
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:41.908Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | BEE & DEE PTE. LTD. | 0.99 |
| Total Amount | 270.32 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 5210 | 0.72 | Shine Mate 7 Foam Pad Flat Face Green Art 34127-9 |
| 2 | 5210 | 0.72 | Shine Mate 6 Foam Pad Flat Face Green Art 34126-9 |
| 3 | 5210 | 0.72 | Shine Mate 6 Foam Pad Flat Face Yellow Art 34126-1 |
| 4 | 5210 | 0.72 | Shine Mate 6 Foam Pad Flat Face Red Art 34126-7 |
| 5 | 5210 | 0.72 | Bodyguard Wheel Brush with Interchangeable Cove... |
| 6 | 5210 | 0.72 | 20 litre Hand Pump |

---

## AI Request - 2026-04-17T08:07:39.977Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 6496ms |
| Input Tokens | 7484 |
| Output Tokens | 753 |
| Total Tokens | 8237 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0090 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2264 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.97
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.99
  },
  "vendorName": {
    "value": "BEE & DEE PTE. LTD.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD Carwash Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "18",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-04-08",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-21",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "149.90",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "13.49",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "163.39",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202503947N",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Bodyguard FeX Iron Remover 5 Liter",
        "confidence": 0.99
      },
      "quantity": {
        "value": "2",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "65.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "130.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "11.70",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.74
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Bodyguard Max View Ceramic Glass Cleaner & Protectant 250ml",
        "confidence": 0.97
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "19.90",
        "confidence": 0.99
      },
      "amount": {
        "value": "19.90",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "1.79",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.74
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:46.484Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.97 |
| Vendor | BEE & DEE PTE. LTD. | 0.99 |
| Total Amount | 163.39 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 5210 | 0.74 | Bodyguard FeX Iron Remover 5 Liter |
| 2 | 5210 | 0.74 | Bodyguard Max View Ceramic Glass Cleaner & Prot... |

---

## AI Request - 2026-04-17T08:07:41.370Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 8267ms |
| Input Tokens | 7730 |
| Output Tokens | 487 |
| Total Tokens | 8217 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0080 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1578 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.98
  },
  "vendorName": {
    "value": "Phoenix Commercial Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD CARWASH PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "1800001123/26",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-04-01",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-04-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "5060.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "455.40",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "5515.40",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201805800K",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "License Fee for GD CARWASH PTE. LTD. Year 1 (01-Apr-2026 to 30-Apr-2026)",
        "confidence": 0.98
      },
      "quantity": {
        "value": "1",
        "confidence": 0.8
      },
      "unitPrice": {
        "value": "4800.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "4800.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "432.00",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7820",
        "confidence": 0.71
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "License Fee for GD CARWASH PTE. LTD. Carpark Lot (01-Apr-2026 to 30-Apr-2026)",
        "confidence": 0.98
      },
      "quantity": {
        "value": "1",
        "confidence": 0.8
      },
      "unitPrice": {
        "value": "260.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "260.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "23.40",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.62
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:49.647Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.98 |
| Vendor | Phoenix Commercial Pte. Ltd. | 0.99 |
| Total Amount | 5515.40 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7820 | 0.71 | License Fee for GD CARWASH PTE. LTD. Year 1 (01... |
| 2 | 6700 | 0.62 | License Fee for GD CARWASH PTE. LTD. Carpark Lo... |

---

## AI Request - 2026-04-17T08:07:37.334Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5.4-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | fac30927-0a35-4ac2-8b9e-70a1dbd04f98 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 13068ms |
| Input Tokens | 7191 |
| Output Tokens | 554 |
| Total Tokens | 7745 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0079 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (1597 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.98
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.97
  },
  "vendorName": {
    "value": "BEE & DEE PTE. LTD.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD Carwash Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "16",
    "confidence": 0.92
  },
  "documentDate": {
    "value": "2026-04-07",
    "confidence": 0.98
  },
  "dueDate": {
    "value": "2026-04-21",
    "confidence": 0.98
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "90.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "8.10",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "98.10",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202503947N",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "180ML Air Freshener (Ocean)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "30",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "3.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "90.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "8.10",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.78
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-04-17T08:07:50.411Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.98 |
| Vendor | BEE & DEE PTE. LTD. | 0.99 |
| Total Amount | 98.10 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 5210 | 0.78 | 180ML Air Freshener (Ocean) |

---

