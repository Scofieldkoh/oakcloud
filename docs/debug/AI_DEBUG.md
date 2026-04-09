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
## AI Request - 2026-03-23T01:04:59.667Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 3685ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 1 |
| Pages Processed | 1 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0030 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1080 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.9
  },
  "vendorName": {
    "value": "A8 GROUP PTE LTD",
    "confidence": 0.98
  },
  "customerName": null,
  "documentNumber": {
    "value": "008-2026",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-03-23",
    "confidence": 0.9
  },
  "dueDate": {
    "value": "2026-04-01",
    "confidence": 0.85
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "600.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "54.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "654.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "21229807G",
    "confidence": 0.98
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "SERVICE RENDERED FOR ROOM WG A3 FOR PERIOD 1ST APR 2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "600.00",
        "confidence": 0.9
      },
      "amount": {
        "value": "600.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "54.00",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.98
      },
      "accountCode": {
        "value": "6710",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.94
}
```
</details>

---

## Extraction Results - 2026-03-23T01:05:03.370Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | A8 GROUP PTE LTD | 0.98 |
| Total Amount | 654.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6710 | 0.70 | SERVICE RENDERED FOR ROOM WG A3 FOR PERIOD 1ST ... |

---

## AI Request - 2026-03-23T01:38:29.829Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 8285ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1529 chars)</summary>

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
    "value": "INGENIQUE SOLUTIONS PTE. LTD.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Oaktree Accounting & Corporate Solutions Pte. Ltd.",
    "confidence": 0.95
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
        "value": "PSG Package 1 SentroWeb-Regular 500 Cloud computing software as a service (License) - Customer Due Diligence Module (up to 1,000 case entities). - AML/CFT search and report on customer names. - record keeping and retrieval of past searches. - automated on-going monitoring covering PEP, sanctions, and adverse media. - up to 5 user login. - up to 500 unique name searches per year. - Acuris AML/CFT data.",
        "confidence": 0.95
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
        "value": "6640",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-23T01:38:38.124Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | INGENIQUE SOLUTIONS PTE. LTD. | 0.99 |
| Total Amount | 1853.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6640 | 0.75 | PSG Package 1 SentroWeb-Regular 500 Cloud compu... |

---

## AI Request - 2026-03-24T01:35:45.511Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 4158ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 1 |
| Pages Processed | 1 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0030 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (974 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.9
  },
  "vendorName": {
    "value": "ACCOUNTING AND CORPORATE REGULATORY AUTHORITY",
    "confidence": 0.98
  },
  "documentNumber": {
    "value": "ACRA260324000415",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-03-24",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 1
  },
  "subtotal": {
    "value": "5.05",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "0.45",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "5.50",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "M9-0008879-T",
    "confidence": 0.95
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Business Profile (Co)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "5.05",
        "confidence": 0.95
      },
      "amount": {
        "value": "5.05",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "0.45",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6650",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-03-24T01:35:49.681Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | ACCOUNTING AND CORPORATE REGULATORY AUTHORITY | 0.98 |
| Total Amount | 5.50 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6650 | 0.70 | Business Profile (Co) |

---

## AI Request - 2026-03-24T14:46:42.609Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 4993ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1169 chars)</summary>

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
    "value": "Bespoke Merchandise Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "BESPOKE HABITAT B47WA PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "BMI-3024",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-15",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-12",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "297.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": null,
    "confidence": 0
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Replacement of Foldable Study Table 80 x 40cm, Super Single Bedframe and Mattress",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "297.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "297.00",
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
        "value": "5210",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:47.612Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Merchandise Pte. Ltd. | 0.99 |
| Total Amount | 0.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 5210 | 0.70 | Replacement of Foldable Study Table 80 x 40cm, ... |

---

## AI Request - 2026-03-24T14:46:40.591Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7304ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1431 chars)</summary>

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
    "value": "Bespoke Merchandise Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "BMI-2964",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-08",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-09",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "43.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Super Single Fitted Bedsheet + 1 Pillow cover + 1 bolster cover",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "18.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "18.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6500",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Super Single Comforter (Quilt)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "25.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "25.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6500",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:47.903Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Merchandise Pte. Ltd. | 0.99 |
| Total Amount | 0.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6500 | 0.70 | Super Single Fitted Bedsheet + 1 Pillow cover +... |
| 2 | 6500 | 0.70 | Super Single Comforter (Quilt) |

---

## AI Request - 2026-03-24T14:46:39.626Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 9282ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1473 chars)</summary>

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
    "value": "Bespoke Merchandise Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "BMI-2933",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-08",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-09",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "49.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": null,
    "confidence": 0
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Queen Fitted Bedsheet",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "19.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "19.50",
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
        "value": "6500",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Queen (Double) Comforter (Quilt)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "30.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "30.00",
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
        "value": "6500",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:48.915Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Merchandise Pte. Ltd. | 0.99 |
| Total Amount | 0.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6500 | 0.70 | Queen Fitted Bedsheet |
| 2 | 6500 | 0.70 | Queen (Double) Comforter (Quilt) |

---

## AI Request - 2026-03-24T14:46:38.571Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 11587ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1645 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "ADM-9471",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-02-25",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-03-02",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "80.20",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "7.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "87.20",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Yang Zhenrui, #07-07,CR6,Tanglin View (B47WA), Admin fee for tenancy agreement from 28/02/2026 to 27/02/2027",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.90",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Yang Zhenrui, #07-07,CR6,Tanglin View (B47WA), Cleaning fee for tenancy agreement from 28/02/2026 to 27/02/2027",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "32.70",
        "confidence": 0.99
      },
      "amount": {
        "value": "32.70",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "2.94",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:50.166Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 87.20 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.70 | Yang Zhenrui, #07-07,CR6,Tanglin View (B47WA), ... |
| 2 | 6800 | 0.70 | Yang Zhenrui, #07-07,CR6,Tanglin View (B47WA), ... |

---

## AI Request - 2026-03-24T14:46:43.529Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7842ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1404 chars)</summary>

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
    "value": "Bespoke Merchandise Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "BMI-3271",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-01",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-16",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "42.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": null,
    "confidence": 0
  },
  "totalAmount": {
    "value": "42.50",
    "confidence": 0.99
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Single Fitted Bedsheet + 1 Pillow Cover + 1 Bolster Cove",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "17.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "17.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": null,
        "confidence": 0
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6500",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Single Comforter (Quilt)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "25.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "25.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": null,
        "confidence": 0
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6500",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:51.379Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Merchandise Pte. Ltd. | 0.99 |
| Total Amount | 42.50 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6500 | 0.70 | Single Fitted Bedsheet + 1 Pillow Cover + 1 Bol... |
| 2 | 6500 | 0.70 | Single Comforter (Quilt) |

---

## AI Request - 2026-03-24T14:46:44.492Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7955ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1108 chars)</summary>

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
    "value": "Bespoke CleanPro Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "CLI-26563",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-17",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "340.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "30.60",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "370.60",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202118077G",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Weekly Cleaning conducted for the month of Jan 2026 (06 13 20 27)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "4.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "85.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "340.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "30.60",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.99
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:52.455Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | Bespoke CleanPro Pte. Ltd. | 0.99 |
| Total Amount | 370.60 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6800 | 0.70 | Weekly Cleaning conducted for the month of Jan ... |

---

## AI Request - 2026-03-24T14:46:41.563Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 11081ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1791 chars)</summary>

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
    "value": "Bespoke Merchandise Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "BMI-2966",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-08",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-09",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "43.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "0.32",
    "confidence": 0.99
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Super Single Fitted Bedsheet + 1 Pillow cover + 1 bolster cover",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "18.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "18.50",
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
        "value": "6500",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Super Single Comforter (Quilt)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "25.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "25.00",
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
        "value": "6500",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Less Amount Credited",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "-43.18",
        "confidence": 0.99
      },
      "amount": {
        "value": "-43.18",
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
        "value": "4120",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:52.651Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Merchandise Pte. Ltd. | 0.99 |
| Total Amount | 0.32 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6500 | 0.75 | Super Single Fitted Bedsheet + 1 Pillow cover +... |
| 2 | 6500 | 0.75 | Super Single Comforter (Quilt) |
| 3 | 4120 | 0.75 | Less Amount Credited |

---

## AI Request - 2026-03-24T14:46:45.448Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 8314ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1112 chars)</summary>

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
    "value": "Bespoke CleanPro Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "CLI-26738",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-17",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "362.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "32.63",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "395.13",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202118077G",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Weekly Cleaning conducted for the month of Jan 2026 (01 08 15 22 29)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "5.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "72.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "362.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "32.63",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:53.769Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke CleanPro Pte. Ltd. | 0.99 |
| Total Amount | 395.13 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6800 | 0.75 | Weekly Cleaning conducted for the month of Jan ... |

---

## AI Request - 2026-03-24T14:46:47.394Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7566ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1111 chars)</summary>

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
    "value": "Bespoke CleanPro Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "CLI-26800",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-17",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "300.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "27.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "327.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202118077G",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Weekly Cleaning conducted for the month of Jan 2026 (02 09 16 23 30)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "5.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "60.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "300.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "27.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:54.967Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke CleanPro Pte. Ltd. | 0.99 |
| Total Amount | 327.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6800 | 0.70 | Weekly Cleaning conducted for the month of Jan ... |

---

## AI Request - 2026-03-24T14:46:46.425Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 8972ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1062 chars)</summary>

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
    "value": "Bespoke CleanPro Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "CLI-26759",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-17",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "425.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "38.25",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "463.25",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202118077G",
    "confidence": 0.99
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Weekly Cleaning conducted for the month of Jan 2026 (01 08 15 22 29)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "5.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "85.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "425.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "38.25",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:55.405Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke CleanPro Pte. Ltd. | 0.99 |
| Total Amount | 463.25 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6800 | 0.75 | Weekly Cleaning conducted for the month of Jan ... |

---

## AI Request - 2026-03-24T14:46:50.638Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 6048ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 1 |
| Pages Processed | 1 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0030 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1086 chars)</summary>

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
    "value": "Oaktree Accounting & Corporate Solutions Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "INV-1000000278",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-02-26",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-03-12",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "300.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "300.00",
    "confidence": 0.99
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "ACC-MTH, Monthly account services Period: Jan 2026",
        "confidence": 0.99
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
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6610",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:56.696Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Oaktree Accounting & Corporate Solutions Pte. Ltd. | 0.99 |
| Total Amount | 300.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6610 | 0.75 | ACC-MTH, Monthly account services Period: Jan 2026 |

---

## AI Request - 2026-03-24T14:46:49.437Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7982ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1172 chars)</summary>

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
    "value": "THE TECH SUPPORT PTE. LTD.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "INV-0712",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-02-28",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-03-14",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "58.99",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "58.99",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": null,
    "confidence": 0
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "#06-06, The Crest - Monthly ISP + Managed Services Billing Period (28/02/2026-27/03/2026)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "58.99",
        "confidence": 0.99
      },
      "amount": {
        "value": "58.99",
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
        "value": "6900",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:57.427Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | THE TECH SUPPORT PTE. LTD. | 0.99 |
| Total Amount | 58.99 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6900 | 0.70 | #06-06, The Crest - Monthly ISP + Managed Servi... |

---

## AI Request - 2026-03-24T14:46:48.447Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 9246ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1100 chars)</summary>

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
    "value": "THE TECH SUPPORT PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "INV-0648",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-02-21",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-03-07",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "58.99",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "58.99",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": null,
    "confidence": 0
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "#10-18, Sunshine Plaza - Monthly ISP + Managed Services Billing Period (21/02/2026-20/03/2026)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "58.99",
        "confidence": 0.95
      },
      "amount": {
        "value": "58.99",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "NA",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6920",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-03-24T14:46:57.701Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | THE TECH SUPPORT PTE. LTD. | 0.99 |
| Total Amount | 58.99 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6920 | 0.70 | #10-18, Sunshine Plaza - Monthly ISP + Managed ... |

---

## AI Request - 2026-03-24T14:46:54.608Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 6965ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1526 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.9
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "MF-12519",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "100.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "9.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "109.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "ECON1 - AZRA KATERINA MAXWELL - Period between 07/12/2025 and 6/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6710",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "CR2 - YANG JYE-RU - Period between 23/12/2025 and 22/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6710",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.96
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:01.581Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.90 |
| Total Amount | 109.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6710 | 0.70 | ECON1 - AZRA KATERINA MAXWELL - Period between ... |
| 2 | 6710 | 0.70 | CR2 - YANG JYE-RU - Period between 23/12/2025 a... |

---

## AI Request - 2026-03-24T14:46:55.588Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 6428ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1166 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MF-12520",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "54.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "4.50",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "59.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR3 - LUCES JONALD BRYAN FRANCIA - Period between 22/12/2025 and 21/1/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:02.025Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 59.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | CR3 - LUCES JONALD BRYAN FRANCIA - Period betwe... |

---

## AI Request - 2026-03-24T14:46:53.600Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 8693ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1087 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "MF-12518",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "54.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "4.50",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "59.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR5 - XU HUA - Period between 03/12/2025 and 2/1/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:02.302Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 59.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.70 | CR5 - XU HUA - Period between 03/12/2025 and 2/... |

---

## AI Request - 2026-03-24T14:46:56.549Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 5938ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1093 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.95
  },
  "customerName": null,
  "documentNumber": {
    "value": "MF-12521",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-01-15",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "54.50",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "4.50",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "59.00",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.95
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR4 - FAN KAIXUAN - Period between 30/12/2025 and 29/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.95
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:02.496Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | Bespoke Habitat Pte Ltd | 0.95 |
| Total Amount | 59.00 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.70 | CR4 - FAN KAIXUAN - Period between 30/12/2025 a... |

---

## AI Request - 2026-03-24T14:46:52.619Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 10380ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (2407 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "L-000166",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-19",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "1000.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "90.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "1090.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Tanglin View #07-07 - Licensing fee for Jan 2026 Staging Date : 13/06/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "272.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "272.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "24.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6640",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Sunshine Plaza Residences B10 #10-18 - Licensing fee for Jan 2026 Staging Date : 22/10/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "272.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "272.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "24.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6640",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Tanglin View B156A#15-19 - Licensing fee for Jan 2026 Staging Date : 05/09/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "272.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "272.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "24.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6640",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "The Crest B101 #06-06 - Licensing fee for Jan 2026 Staging Date : 30/10/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "272.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "272.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "24.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6640",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:03.007Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 1090.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6640 | 0.75 | Tanglin View #07-07 - Licensing fee for Jan 202... |
| 2 | 6640 | 0.75 | Sunshine Plaza Residences B10 #10-18 - Licensin... |
| 3 | 6640 | 0.75 | Tanglin View B156A#15-19 - Licensing fee for Ja... |
| 4 | 6640 | 0.75 | The Crest B101 #06-06 - Licensing fee for Jan 2... |

---

## AI Request - 2026-03-24T14:46:57.565Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 6168ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1091 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.95
  },
  "customerName": null,
  "documentNumber": {
    "value": "MF-12522",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-01-15",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "54.50",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "4.50",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "59.00",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.95
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "MBR6 - DU YIFAN - Period between 23/12/2025 and 22/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.95
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:03.740Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | Bespoke Habitat Pte Ltd | 0.95 |
| Total Amount | 59.00 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.70 | MBR6 - DU YIFAN - Period between 23/12/2025 and... |

---

## AI Request - 2026-03-24T14:46:51.647Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 14121ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (2436 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "L-000121",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-21",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "900.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "90.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "1090.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Tanglin View #07-07 - Licensing fee for Dec 2025 Staging Date : 13/06/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "272.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "272.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "24.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Sunshine Plaza Residences B10 #10-18 - Licensing fee for Dec 2025 Staging Date : 22/10/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "272.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "272.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "24.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Tanglin View B156A#15-19 - Licensing fee for Dec 2025 Staging Date : 05/09/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "272.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "272.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "24.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "The Crest B101 #06-06 - Licensing fee for Dec 2025 Staging Date : 30/10/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "272.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "272.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "24.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:05.776Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 1090.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | Tanglin View #07-07 - Licensing fee for Dec 202... |
| 2 | 6700 | 0.75 | Sunshine Plaza Residences B10 #10-18 - Licensin... |
| 3 | 6700 | 0.75 | Tanglin View B156A#15-19 - Licensing fee for De... |
| 4 | 6700 | 0.75 | The Crest B101 #06-06 - Licensing fee for Dec 2... |

---

## AI Request - 2026-03-24T14:46:58.561Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 8474ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (2353 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MF-12523",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "180.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "18.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "198.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR4 - ELOUAN CORENTIN MARIN MICHEL - Period between 02/12/2025 and 1/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "CR1 - GAO YUANHUI - Period between 12/12/2025 and 11/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "MBR5 - HUANG HAOAN - Period between 26/12/2025 and 25/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "ECON2 - WANG YUBO - Period between 01/12/2025 and 31/12/2025",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:07.044Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 198.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.70 | CR4 - ELOUAN CORENTIN MARIN MICHEL - Period bet... |
| 2 | 6700 | 0.70 | CR1 - GAO YUANHUI - Period between 12/12/2025 a... |
| 3 | 6700 | 0.70 | MBR5 - HUANG HAOAN - Period between 26/12/2025 ... |
| 4 | 6700 | 0.70 | ECON2 - WANG YUBO - Period between 01/12/2025 a... |

---

## AI Request - 2026-03-24T14:47:01.611Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 6018ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1088 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "MF-13090",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-24",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "54.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "4.50",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "59.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR5 - XU HUA - Period between 03/01/2026 and 2/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:07.638Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 59.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | CR5 - XU HUA - Period between 03/01/2026 and 2/... |

---

## AI Request - 2026-03-24T14:47:04.597Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 4971ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1093 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "MF-13093",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-24",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "50.98",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "4.21",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "55.19",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR4 - FAN KAIXUAN - Period between 30/01/2026 and 27/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "50.98",
        "confidence": 0.99
      },
      "amount": {
        "value": "50.98",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.21",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:09.577Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 55.19 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.70 | CR4 - FAN KAIXUAN - Period between 30/01/2026 a... |

---

## AI Request - 2026-03-24T14:47:02.637Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7308ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1559 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MF-13091",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-24",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "100.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "9.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "109.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "ECON1 - AZRA KATERINA MAXWELL - Period between 07/01/2026 and 6/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.90",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "CR2 - YANG JYE-RU - Period between 23/01/2026 and 22/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.90",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:09.954Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 109.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | ECON1 - AZRA KATERINA MAXWELL - Period between ... |
| 2 | 6700 | 0.75 | CR2 - YANG JYE-RU - Period between 23/01/2026 a... |

---

## AI Request - 2026-03-24T14:47:00.618Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 10018ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (3134 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MF-12525",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "270.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "27.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "327.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "MBR4 - HUANG SIHAN - Period between 02/12/2025 and 1/1/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "PRS3 - LU JUN JIE - Period between 08/12/2025 and 7/1/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "CR5 - NURMUKHAMED MUSSAYEV - Period between 27/12/2025 and 26/1/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "MBR1 - PADILLA GARCIA DANIEL - Period between 01/12/2025 and 31/12/2025",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "ECON6 - RINALDI - Period between 12/12/2025 and 11/1/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 6,
      "description": {
        "value": "PRS2 - SUTARIYA VATSAL HARSUKHBHAI - Period between 15/12/2025 and 14/1/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:10.646Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 327.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | MBR4 - HUANG SIHAN - Period between 02/12/2025 ... |
| 2 | 6700 | 0.75 | PRS3 - LU JUN JIE - Period between 08/12/2025 a... |
| 3 | 6700 | 0.75 | CR5 - NURMUKHAMED MUSSAYEV - Period between 27/... |
| 4 | 6700 | 0.75 | MBR1 - PADILLA GARCIA DANIEL - Period between 0... |
| 5 | 6700 | 0.75 | ECON6 - RINALDI - Period between 12/12/2025 and... |
| 6 | 6700 | 0.75 | PRS2 - SUTARIYA VATSAL HARSUKHBHAI - Period bet... |

---

## AI Request - 2026-03-24T14:47:03.614Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7383ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1058 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "MF-13092",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-24",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "54.50",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "4.50",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "59.00",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.95
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR3 - LUCES JONALD BRYAN FRANCIA - Period between 22/01/2026 and 21/2/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.95
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:11.007Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | Bespoke Habitat Pte Ltd | 0.95 |
| Total Amount | 59.00 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.70 | CR3 - LUCES JONALD BRYAN FRANCIA - Period betwe... |

---

## AI Request - 2026-03-24T14:46:59.609Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 11999ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1963 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MF-12524",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2025-12-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "150.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "13.50",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "163.50",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "MBR4 - HUANG CHAO & HUANG DONGYUAN - Period between 24/12/2025 and 23/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6710",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "CR1 - LIAO TENGYU - Period between 11/12/2025 and 10/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6710",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "CR3 - ZHANG HAOGANG - Period between 26/12/2025 and 25/1/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6710",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:11.618Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 163.50 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6710 | 0.75 | MBR4 - HUANG CHAO & HUANG DONGYUAN - Period bet... |
| 2 | 6710 | 0.75 | CR1 - LIAO TENGYU - Period between 11/12/2025 a... |
| 3 | 6710 | 0.75 | CR3 - ZHANG HAOGANG - Period between 26/12/2025... |

---

## AI Request - 2026-03-24T14:47:05.543Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 7184ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1091 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "MF-13094",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-24",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "54.50",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "4.50",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "59.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "MBR6 - DU YIFAN - Period between 23/01/2026 and 22/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.50",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6710",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:12.737Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 59.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6710 | 0.70 | MBR6 - DU YIFAN - Period between 23/01/2026 and... |

---

## AI Request - 2026-03-24T14:47:07.493Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 8804ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1963 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MF-13096",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-24",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "150.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "13.50",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "163.50",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR1 - LIAO TENGYU - Period between 11/01/2026 and 10/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "CR3 - ZHANG HAOGANG - Period between 26/01/2026 and 25/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "MBR4 - HUANG CHAO & HUANG DONGYUAN - Period between 24/01/2026 and 23/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:16.308Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 163.50 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | CR1 - LIAO TENGYU - Period between 11/01/2026 a... |
| 2 | 6700 | 0.75 | CR3 - ZHANG HAOGANG - Period between 26/01/2026... |
| 3 | 6700 | 0.75 | MBR4 - HUANG CHAO & HUANG DONGYUAN - Period bet... |

---

## AI Request - 2026-03-24T14:47:10.537Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 6202ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 3 |
| Pages Processed | 3 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0090 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1207 chars)</summary>

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
    "value": "StarHub Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "MR ANG CHEE WEI",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "0327556408022026",
    "confidence": 0.98
  },
  "documentDate": {
    "value": "2026-02-20",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-03-06",
    "confidence": 0.98
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "54.4390",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "4.90",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "59.34",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "M9-0005650-C",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Home Broadband @ 150 PRINCE CHARLES CRESCENT #07-07 TANGLIN VIEW Monthly (16/02/26 - 15/03/26) G UltraSpeed (Aft 50% off Broadband)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "54.4390",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.4390",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.90",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6920",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:16.749Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | StarHub Ltd | 0.99 |
| Total Amount | 59.34 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6920 | 0.75 | Home Broadband @ 150 PRINCE CHARLES CRESCENT #0... |

---

## AI Request - 2026-03-24T14:47:06.534Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 10275ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (2377 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "BESPOKE HABITAT B47WA PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MF-13095",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-24",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "180.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "18.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "198.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "CR1 - GAO YUANHUI - Period between 12/01/2026 and 11/2/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "ECON2 - DOLLE THOMAS HUGUES LEON ROBERT - Period between 10/01/2026 and 9/2/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "CR4 - ELOUAN CORENTIN MARIN MICHEL - Period between 02/01/2026 and 1/2/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "MBR5 - HUANG HAOAN - Period between 26/01/2026 and 25/2/2026",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:16.819Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 198.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | CR1 - GAO YUANHUI - Period between 12/01/2026 a... |
| 2 | 6700 | 0.75 | ECON2 - DOLLE THOMAS HUGUES LEON ROBERT - Perio... |
| 3 | 6700 | 0.75 | CR4 - ELOUAN CORENTIN MARIN MICHEL - Period bet... |
| 4 | 6700 | 0.75 | MBR5 - HUANG HAOAN - Period between 26/01/2026 ... |

---

## AI Request - 2026-03-24T14:47:08.481Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 10669ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (3133 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Bespoke Habitat B47WA Pte. Ltd.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MF-13097",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-24",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "270.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "27.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "327.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "MBR1 - PADILLA GARCIA DANIEL - Period between 01/01/2026 and 31/1/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "PRS2 - SUTARIYA VATSAL HARSUKHBHAI - Period between 15/01/2026 and 14/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "PRS3 - LU JUN JIE - Period between 08/01/2026 and 7/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "MBR4 - HUANG SIHAN - Period between 02/01/2026 and 1/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "CR5 - NURMUKHAMED MUSSAYEV - Period between 27/01/2026 and 26/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 6,
      "description": {
        "value": "ECON6 - RINALDI - Period between 12/01/2026 and 11/2/2026",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.91",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:19.160Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 327.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | MBR1 - PADILLA GARCIA DANIEL - Period between 0... |
| 2 | 6700 | 0.75 | PRS2 - SUTARIYA VATSAL HARSUKHBHAI - Period bet... |
| 3 | 6700 | 0.75 | PRS3 - LU JUN JIE - Period between 08/01/2026 a... |
| 4 | 6700 | 0.75 | MBR4 - HUANG SIHAN - Period between 02/01/2026 ... |
| 5 | 6700 | 0.75 | CR5 - NURMUKHAMED MUSSAYEV - Period between 27/... |
| 6 | 6700 | 0.75 | ECON6 - RINALDI - Period between 12/01/2026 and... |

---

## AI Request - 2026-03-24T14:47:11.722Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 10301ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (2217 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "SP Services Ltd",
    "confidence": 0.99
  },
  "customerName": null,
  "documentNumber": {
    "value": "155-000383-00192-1790",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-02-04",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-19",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "240.64",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "21.66",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "262.30",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "M2-8920920-4",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Electricity Services",
        "confidence": 0.99
      },
      "quantity": {
        "value": "661",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "0.2671",
        "confidence": 0.99
      },
      "amount": {
        "value": "176.55",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "15.89",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Gas Services by City Energy Pte. Ltd. (as Trustee of City Energy Trust)",
        "confidence": 0.99
      },
      "quantity": {
        "value": "8",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "0.2168",
        "confidence": 0.99
      },
      "amount": {
        "value": "1.72",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.15",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Water Services by Public Utilities Board",
        "confidence": 0.99
      },
      "quantity": {
        "value": "16.4",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "3.2700",
        "confidence": 0.99
      },
      "amount": {
        "value": "53.07",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.78",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "Refuse Removal by Cora Environment Pte Ltd",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "9.30",
        "confidence": 0.99
      },
      "amount": {
        "value": "9.30",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.84",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:22.034Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | SP Services Ltd | 0.99 |
| Total Amount | 262.30 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7110 | 0.70 | Electricity Services |
| 2 | 7110 | 0.70 | Gas Services by City Energy Pte. Ltd. (as Trust... |
| 3 | 7110 | 0.70 | Water Services by Public Utilities Board |
| 4 | 7110 | 0.70 | Refuse Removal by Cora Environment Pte Ltd |

---

## AI Request - 2026-03-24T14:47:09.490Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 13747ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 3 |
| Pages Processed | 3 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0090 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (2205 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "StarHub Ltd",
    "confidence": 0.95
  },
  "customerName": {
    "value": "MR ANG CHEE WEI",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "0327206694022026",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-02-11",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-25",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "82.4336",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "7.42",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "89.85",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "M9-0005650-C",
    "confidence": 0.95
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "G UltraSpeed 5Gbps (Aft 43% off Broadband)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "35.6909",
        "confidence": 0.95
      },
      "amount": {
        "value": "35.6909",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "3.2122",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6920",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "G CyberProtect 3 (Disc 100%:12Mth)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "0",
        "confidence": 0.95
      },
      "amount": {
        "value": "0",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "0",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6410",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "G UltraSpeed 5Gbps (Aft Disc)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "44.8819",
        "confidence": 0.95
      },
      "amount": {
        "value": "44.8819",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "4.0394",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6920",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "G CyberProtect 3 (Aft Disc)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "1.8608",
        "confidence": 0.95
      },
      "amount": {
        "value": "1.8608",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "0.1675",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6410",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:23.250Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | StarHub Ltd | 0.95 |
| Total Amount | 89.85 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6920 | 0.70 | G UltraSpeed 5Gbps (Aft 43% off Broadband) |
| 2 | 6410 | 0.70 | G CyberProtect 3 (Disc 100%:12Mth) |
| 3 | 6920 | 0.70 | G UltraSpeed 5Gbps (Aft Disc) |
| 4 | 6410 | 0.70 | G CyberProtect 3 (Aft Disc) |

---

## AI Request - 2026-03-24T14:47:13.998Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 13059ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (2529 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.9
  },
  "vendorName": {
    "value": "SP Services Ltd",
    "confidence": 0.98
  },
  "customerName": null,
  "documentNumber": {
    "value": "255-000091-00046-1646",
    "confidence": 0.9
  },
  "documentDate": {
    "value": "2026-02-12",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-26",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 1
  },
  "subtotal": {
    "value": "422.93",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "38.07",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "461.00",
    "confidence": 1
  },
  "supplierGstNo": {
    "value": "M2-8920920-4",
    "confidence": 0.98
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Electricity Services",
        "confidence": 0.95
      },
      "quantity": {
        "value": "645",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "0.2671",
        "confidence": 0.9
      },
      "amount": {
        "value": "172.28",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "15.50",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Gas Services by City Energy Pte. Ltd. (as Trustee of City Energy Trust)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "424",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "0.2168",
        "confidence": 0.9
      },
      "amount": {
        "value": "92.46",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "8.32",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Water Services by Public Utilities Board",
        "confidence": 0.95
      },
      "quantity": {
        "value": "48.9",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "1.4300",
        "confidence": 0.9
      },
      "amount": {
        "value": "69.93",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "6.29",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "Waterborne Tax",
        "confidence": 0.95
      },
      "quantity": {
        "value": "48.9",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "1.0900",
        "confidence": 0.9
      },
      "amount": {
        "value": "53.30",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "4.80",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "Water Conservation Tax",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "34.96",
        "confidence": 0.9
      },
      "amount": {
        "value": "34.96",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "3.15",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.94
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:27.070Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | SP Services Ltd | 0.98 |
| Total Amount | 461.00 SGD | 1.00 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7110 | 0.70 | Electricity Services |
| 2 | 7110 | 0.70 | Gas Services by City Energy Pte. Ltd. (as Trust... |
| 3 | 7110 | 0.70 | Water Services by Public Utilities Board |
| 4 | 7110 | 0.70 | Waterborne Tax |
| 5 | 7110 | 0.70 | Water Conservation Tax |

---

## AI Request - 2026-03-24T14:47:16.077Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 11032ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1578 chars)</summary>

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
    "value": "Bespoke Habitat Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "HSU CHIA-WEN",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "ADM-9467",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-02-25",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-03-02",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "80.20",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "7.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "87.20",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201924330Z",
    "confidence": 0.99
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "HSU CHIA-WEN, #06-06,prs3,the crest, Admin fee for tenancy agreement from 15/04/2026 to 14/04/2027",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "54.50",
        "confidence": 0.99
      },
      "amount": {
        "value": "54.50",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "4.90",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.75
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "HSU CHIA-WEN, #06-06,prs3,the crest, Cleaning fee for tenancy agreement from 15/04/2026 to 14/04/2027",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "32.70",
        "confidence": 0.99
      },
      "amount": {
        "value": "32.70",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "2.94",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.75
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:27.122Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | Bespoke Habitat Pte Ltd | 0.99 |
| Total Amount | 87.20 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.75 | HSU CHIA-WEN, #06-06,prs3,the crest, Admin fee ... |
| 2 | 6800 | 0.75 | HSU CHIA-WEN, #06-06,prs3,the crest, Cleaning f... |

---

## AI Request - 2026-03-24T14:47:15.122Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 12040ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (2574 chars)</summary>

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
    "value": "SP Services Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "BESPOKE HABITAT B47WA PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "155-000387-00194-1792",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-02-04",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-19",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "350.46",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "31.54",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "382.00",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "M2-8920920-4",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Electricity Services",
        "confidence": 0.95
      },
      "quantity": {
        "value": "835",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "0.2671",
        "confidence": 0.95
      },
      "amount": {
        "value": "223.03",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "20.07",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7100",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Water Services by Public Utilities Board",
        "confidence": 0.95
      },
      "quantity": {
        "value": "25.8",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "1.4300",
        "confidence": 0.95
      },
      "amount": {
        "value": "36.90",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "3.32",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Waterborne Tax",
        "confidence": 0.95
      },
      "quantity": {
        "value": "25.8",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "1.0900",
        "confidence": 0.95
      },
      "amount": {
        "value": "28.12",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "2.53",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "Water Conservation Tax",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "18.44",
        "confidence": 0.95
      },
      "amount": {
        "value": "18.44",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "1.66",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7110",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "Refuse Removal by TEE Environmental P L",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "16.70",
        "confidence": 0.95
      },
      "amount": {
        "value": "16.70",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "1.50",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7120",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:27.173Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | SP Services Ltd | 0.99 |
| Total Amount | 382.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7100 | 0.70 | Electricity Services |
| 2 | 7110 | 0.70 | Water Services by Public Utilities Board |
| 3 | 7110 | 0.70 | Waterborne Tax |
| 4 | 7110 | 0.70 | Water Conservation Tax |
| 5 | 7120 | 0.70 | Refuse Removal by TEE Environmental P L |

---

## AI Request - 2026-03-24T14:47:12.899Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 14717ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1840 chars)</summary>

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
    "value": "SP Services Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "BESPOKE HABITAT B47WA PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "155-000385-00193-1791",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-02-04",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-19",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "263.19",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "23.69",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "286.88",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "M2-8920920-4",
    "confidence": 0.99
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Electricity Services",
        "confidence": 0.99
      },
      "quantity": {
        "value": "873",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "0.2671",
        "confidence": 0.95
      },
      "amount": {
        "value": "233.18",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "21.00",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7100",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Water Services by Public Utilities Board",
        "confidence": 0.99
      },
      "quantity": {
        "value": "6.4",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "3.2578",
        "confidence": 0.95
      },
      "amount": {
        "value": "20.71",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "1.86",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7100",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Refuse Removal by Core Environment Pte Ltd",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "9.30",
        "confidence": 0.95
      },
      "amount": {
        "value": "9.30",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "0.84",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7100",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.97
}
```
</details>

---

## Extraction Results - 2026-03-24T14:47:27.627Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | SP Services Ltd | 0.99 |
| Total Amount | 286.88 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7100 | 0.70 | Electricity Services |
| 2 | 7100 | 0.70 | Water Services by Public Utilities Board |
| 3 | 7100 | 0.70 | Refuse Removal by Core Environment Pte Ltd |

---

## AI Request - 2026-03-25T01:07:50.916Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 2 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 32997ms |
| Input Tokens | 9991 |
| Output Tokens | 2431 |
| Total Tokens | 12422 |
| Estimated Cost | $0.0074 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2122 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "medium",
  "summary": "ID number on form does not match passport attachment; require corrected ID and clarification before onboarding.",
  "tags": [
    "id-mismatch",
    "doc-mismatch"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "NRIC/ FIN/ Passport Number (form field 'nric_fin_passport_number') value 'S8456617I' does not match passport number in attachment 'Passport - HAN WEI - 25 Mar 26.pdf' (passport shows 'EJ6452933'). Cannot verify: NRIC/ FIN/ Passport Number S8456617I",
        "Issuing Country (form field 'issuing_country') = 'Singapore' is inconsistent with passport country on 'Passport - HAN WEI - 25 Mar 26.pdf' (document header: 'PEOPLE'S REPUBLIC OF CHINA'; place of issue shows 'SINGAPORE'). Clarify which value is intended.",
        "Uploaded passport originalFileName 'Kevin Passport.pdf' (attachment 'Passport - HAN WEI - 25 Mar 26.pdf') differs from respondent name 'HAN WEI' (form field 'full_name') — filename inconsistency requires confirmation the document belongs to the applicant."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Request respondent to confirm the correct identity number and update the form: if passport is primary ID, re-submit the passport number matching the passport data page (EJ6452933); if NRIC/FIN S8456617I is intended, provide a clear scan/photo of the NRIC/FIN front.",
        "Ask respondent to clarify 'Issuing Country' selection and, if needed, correct the form to reflect the passport country or provide an explanation and supporting evidence (eg. citizenship/PR proof) for selecting 'Singapore'.",
        "Request re-upload of the passport data page with a filename that matches the respondent (e.g., 'Passport_HAN_WEI.pdf'), ensuring the passport number, name, DOB, and MRZ are legible.",
        "Place onboarding on hold and escalate to manual compliance review until the above documents and clarifications are received and ID inconsistency is resolved."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-03-25T01:31:31.375Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 3 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 25578ms |
| Input Tokens | 11830 |
| Output Tokens | 1945 |
| Total Tokens | 13775 |
| Estimated Cost | $0.0068 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2515 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "medium",
  "summary": "Passport image is not verifiable and proof of address does not match the applicant; resubmit corrected ID and address documents.",
  "tags": [
    "doc-missing",
    "address-mismatch",
    "id-mismatch"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "Cannot verify: Passport (field 'passport' / file 'Passport - GUO ZHIXIONG - 25 Mar 26.pdf' appears to be a Chinese national ID copy rather than a passport biographic page).",
        "Proof of Address mismatch (field 'proof_of_address' / file 'Proof of Address - GUO ZHIXIONG - 25 Mar 26.pdf'): uploaded document is an SP Services bill for 'MR HAN WEI' at 41 PASIR PANJANG HILL, SINGAPORE, which does not match the form Residential Address 'guangdong sheng shenzhenshi nanshan province xingnan lu 9th' or the applicant name 'GUO ZHIXIONG'.",
        "Identity document type inconsistency (field 'nric' / file 'NRIC - GUO ZHIXIONG - 25 Mar 26.pdf'): provided document is a Chinese Resident Identity Card (number 440582199012074336) not a Singapore NRIC. Form selected supporting_documents = 'Passport/ Proof of Address' but a verifiable passport image is not present.",
        "Missing mandatory ID evidence: per submission, either a Singapore NRIC OR a passport + valid proof of address is required. Neither a verifiable passport nor a Singapore NRIC in accepted format is provided (fields 'passport' and 'nric')."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Request applicant to re-submit a clear colour scan/photo of the passport biographic page (field 'passport') showing name, passport number, nationality, DOB and expiry.",
        "Request a proof of address in the applicant's name matching the declared residential address (e.g., recent utility bill, bank statement) dated within the accepted timeframe; do not accept documents in a third party's name unless accompanied by a declaration and evidence of living arrangement.",
        "Ask applicant to confirm if the SP Services bill (file 'Proof of Address - GUO ZHIXIONG - 25 Mar 26.pdf') pertains to them or explain relationship to 'MR HAN WEI' and provide supporting evidence if relevant.",
        "Hold onboarding pending receipt and verification of corrected passport and matching proof of address; escalate to compliance/EDD if discrepancies remain after applicant response."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-03-27T02:12:33.276Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 9475ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 2 |
| Pages Processed | 2 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0060 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (3112 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "Protoss IT Sdn Bhd",
    "confidence": 0.98
  },
  "customerName": {
    "value": "Oaktree Accounting & Corporate Solutions Pte. Ltd.",
    "confidence": 0.9
  },
  "documentNumber": {
    "value": "I2421431",
    "confidence": 0.9
  },
  "documentDate": {
    "value": "2026-02-26",
    "confidence": 0.9
  },
  "dueDate": {
    "value": null,
    "confidence": 0
  },
  "currency": {
    "value": "MYR",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "2434.40",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "2434.40",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "1247131-X",
    "confidence": 0.95
  },
  "homeCurrencyEquivalent": {
    "currency": "SGD",
    "exchangeRate": null,
    "subtotal": null,
    "taxAmount": null,
    "totalAmount": null,
    "confidence": 0
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Leaflets: 310g art card, A4, 6000 units, Double side (4C+4C), 1 style, 210mmx297mm, 310g Glossy Art Board, 1(3d), RM 902.40",
        "confidence": 0.9
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "902.40",
        "confidence": 0.9
      },
      "amount": {
        "value": "902.40",
        "confidence": 0.9
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "ZR",
        "confidence": 0.9
      },
      "accountCode": {
        "value": "6500",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Gloss Lam (A4)",
        "confidence": 0.9
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "278.80",
        "confidence": 0.9
      },
      "amount": {
        "value": "278.80",
        "confidence": 0.9
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "ZR",
        "confidence": 0.9
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Cutting",
        "confidence": 0.9
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "36.00",
        "confidence": 0.9
      },
      "amount": {
        "value": "36.00",
        "confidence": 0.9
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "ZR",
        "confidence": 0.9
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "Leaflets: 310g art card, A4, 6000 units, Double side (4C+4C), 1 style, 210mmx297mm, 310g Glossy Art Board, 1(3d), RM 902.40",
        "confidence": 0.9
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "902.40",
        "confidence": 0.9
      },
      "amount": {
        "value": "902.40",
        "confidence": 0.9
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "ZR",
        "confidence": 0.9
      },
      "accountCode": {
        "value": "6500",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "Gloss Lam (A4)",
        "confidence": 0.9
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "278.80",
        "confidence": 0.9
      },
      "amount": {
        "value": "278.80",
        "confidence": 0.9
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "ZR",
        "confidence": 0.9
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.7
      }
    },
    {
      "lineNo": 6,
      "description": {
        "value": "Cutting",
        "confidence": 0.9
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "36.00",
        "confidence": 0.9
      },
      "amount": {
        "value": "36.00",
        "confidence": 0.9
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.9
      },
      "taxCode": {
        "value": "ZR",
        "confidence": 0.9
      },
      "accountCode": {
        "value": "6800",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.92
}
```
</details>

---

## Extraction Results - 2026-03-27T02:12:42.769Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | Protoss IT Sdn Bhd | 0.98 |
| Total Amount | 2434.40 MYR | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6500 | 0.70 | Leaflets: 310g art card, A4, 6000 units, Double... |
| 2 | 6800 | 0.70 | Gloss Lam (A4) |
| 3 | 6800 | 0.70 | Cutting |
| 4 | 6500 | 0.70 | Leaflets: 310g art card, A4, 6000 units, Double... |
| 5 | 6800 | 0.70 | Gloss Lam (A4) |
| 6 | 6800 | 0.70 | Cutting |

---

## AI Request - 2026-03-27T02:12:53.746Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | unknown |
| Model | mistral-ocr-latest |
| Provider | mistral |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | default |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 3880ms |
| Input Tokens | 0 |
| Output Tokens | 0 |
| Total Tokens | 1 |
| Pages Processed | 1 |
| Pricing Mode | Direct |
| Estimated Cost | $0.0030 |
| Connector Source | tenant |
| Connector ID | c4289371-da71-4800-b107-a7650e938bfc |

<details>
<summary>Response (1030 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "VENDOR_INVOICE",
    "confidence": 0.9
  },
  "vendorName": {
    "value": "ACCOUNTING AND CORPORATE REGULATORY AUTHORITY",
    "confidence": 0.98
  },
  "customerName": {
    "value": "TAN WEI JIE",
    "confidence": 0.9
  },
  "documentNumber": {
    "value": "ACRA260326003809",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-03-26",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 1
  },
  "subtotal": {
    "value": "5.05",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "0.45",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "5.50",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "M9-0008879-T",
    "confidence": 0.95
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Business Profile (Co)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "5.05",
        "confidence": 0.95
      },
      "amount": {
        "value": "5.05",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "0.45",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7810",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.94
}
```
</details>

---

## Extraction Results - 2026-03-27T02:12:57.642Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | ACCOUNTING AND CORPORATE REGULATORY AUTHORITY | 0.98 |
| Total Amount | 5.50 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7810 | 0.70 | Business Profile (Co) |

---

## AI Request - 2026-03-30T04:35:35.244Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 3 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 52991ms |
| Input Tokens | 11835 |
| Output Tokens | 2362 |
| Total Tokens | 14197 |
| Estimated Cost | $0.0077 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2013 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "medium",
  "summary": "Submitted proof-of-address does not match applicant and passport appears not provided (duplicate ID file); manual follow-up required.",
  "tags": [
    "doc-mismatch",
    "id-mismatch",
    "doc-missing"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "Passport: Cannot verify: passport document is a valid passport matching the provided passport number and expiry date.",
        "Passport and NRIC attachments appear to be the same document (duplicate upload), indicating a passport image may be missing or misfiled.",
        "Proof of Address: document shows name 'MR HAN WEI' and Singapore address 41 PASIR PANJANG HILL, which does not match applicant name 'GUO ZHIXIONG' or the Residential Address provided (Guangdong, China).",
        "Supporting documents selection claimed 'Passport/ Proof of Address' but the uploaded files do not allow verification that a passport in the applicant's name was provided."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Request a clear color scan/photo of the passport biodata page (bio page) showing name, passport number and expiry that matches the form entry (440582199012074336; expiry 2040-03-17).",
        "Request separate, correctly labelled files for NRIC/ID and passport (no duplicate files); confirm which document is which.",
        "Request a proof of address in the applicant's name (recent utility bill, bank statement or tenancy agreement dated within the last 3 months) that matches the Residential Address, or a signed explanation and supporting evidence if the Singapore address belongs to a third party.",
        "Place onboarding on hold pending receipt of the requested documents and escalate to compliance if the applicant cannot provide a passport in their name or a valid proof of address matching their declared residence."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-03-30T04:50:39.692Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_submission_ai_review |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 2 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 59879ms |
| Input Tokens | 9996 |
| Output Tokens | 2960 |
| Total Tokens | 12956 |
| Estimated Cost | $0.0084 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (2054 chars)</summary>

```json
{
  "reviewRequired": true,
  "severity": "medium",
  "summary": "Form shows inconsistencies between the ID number/issuing country fields and the uploaded passport; occupation field appears to contain a company name rather than a job title — staff follow-up required.",
  "tags": [
    "id-mismatch",
    "doc-inconsistency",
    "requires-clarification"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": [
        "Mismatch between ID number entered in 'NRIC/ FIN/ Passport Number' (S8456617I) and the passport document provided in 'Passport' (passport shows a different passport number).",
        "Inconsistency between 'Issuing Country' (Singapore) and the passport's issuing country/country code (People's Republic of China / CHN) as shown on the 'Passport' document.",
        "Cannot verify: Singapore NRIC/FIN number S8456617I (no Singapore NRIC card image provided to support this number).",
        "Occupation/ Profession field contains 'PROCUREMENT PTE. LTD.' which appears to be a company name rather than a job title; role is unclear."
      ]
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": [
        "Ask applicant to confirm whether S8456617I is a Singapore NRIC/FIN or a passport number; if NRIC is claimed, request a clear photo/scan of the Singapore NRIC (front) and ensure the NRIC number matches.",
        "If the passport is the intended ID, ask applicant to update the form with the correct passport number or provide a clearer passport bio-data page to confirm passport number and issuing country.",
        "Request clarification of the 'Issuing Country' selection (explain discrepancy between form entry and passport country of issue).",
        "Request clarification of the 'Occupation/ Profession' entry — provide job title or employer confirmation (e.g., employment letter or recent payslip) if necessary.",
        "Hold onboarding pending receipt of corrected ID details and requested clarifications."
      ]
    }
  ]
}
```
</details>

---

## AI Request - 2026-04-01T09:13:23.188Z

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
| Latency | 24053ms |
| Input Tokens | 5184 |
| Output Tokens | 1525 |
| Total Tokens | 6709 |
| Estimated Cost | $0.0043 |
| Connector Source | tenant |
| Connector ID | d7c5cca3-7b9b-43bf-b15c-521d94805f86 |
| Connector Name | Oaktree |

<details>
<summary>Response (408 chars)</summary>

```json
{
  "reviewRequired": false,
  "severity": "low",
  "summary": "No material issues — Singapore NRIC provided and identity fields are consistent with the attachment.",
  "tags": [
    "low-risk"
  ],
  "sections": [
    {
      "title": "Issues found",
      "type": "bullet_list",
      "items": []
    },
    {
      "title": "Recommended actions",
      "type": "bullet_list",
      "items": []
    }
  ]
}
```
</details>

---

