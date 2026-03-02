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
## AI Request - 2026-03-02T03:57:24.150Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| User | 8820e69e-8cb6-40dd-a4cf-1d670be4ecf9 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 24136ms |
| Input Tokens | 6616 |
| Output Tokens | 1831 |
| Total Tokens | 8447 |
| Estimated Cost | $0.0103 |

<details>
<summary>Response (1619 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TAX_COMPLIANCE",
    "confidence": 0.92
  },
  "documentSubCategory": {
    "value": "TAX_INVOICE",
    "confidence": 0.92
  },
  "vendorName": {
    "value": "Accounting and Corporate Regulatory Authority (ACRA)",
    "confidence": 0.95
  },
  "customerName": {
    "value": "Tan Wei Jie",
    "confidence": 0.9
  },
  "documentNumber": {
    "value": "ACRA260227004151",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-02-27",
    "confidence": 0.98
  },
  "dueDate": {
    "value": null,
    "confidence": 0
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
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
    "confidence": 0.98
  },
  "supplierGstNo": {
    "value": "M9-0008879-T",
    "confidence": 0.95
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Business Profile (Co)",
        "confidence": 0.98
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
        "confidence": 0.97
      },
      "gstAmount": {
        "value": "0.45",
        "confidence": 0.96
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.98
      },
      "accountCode": {
        "value": "7810",
        "confidence": 0.6
      }
    }
  ],
  "overallConfidence": 0.88
}
```
</details>

---

## Extraction Results - 2026-03-02T03:57:48.301Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TAX_COMPLIANCE | 0.92 |
| Vendor | Accounting and Corporate Regulatory Authority (ACRA) | 0.95 |
| Total Amount | 5.50 SGD | 0.98 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7810 | 0.60 | Business Profile (Co) |

---

## AI Request - 2026-03-02T03:57:12.967Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| User | 8820e69e-8cb6-40dd-a4cf-1d670be4ecf9 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 37958ms |
| Input Tokens | 6371 |
| Output Tokens | 2329 |
| Total Tokens | 8700 |
| Estimated Cost | $0.0110 |

<details>
<summary>Response (1571 chars)</summary>

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
    "value": "Singapore Post Limited",
    "confidence": 0.98
  },
  "customerName": null,
  "documentNumber": {
    "value": "221260227160315240",
    "confidence": 0.98
  },
  "documentDate": {
    "value": "2026-02-27",
    "confidence": 0.98
  },
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "1251.38",
    "confidence": 0.9
  },
  "taxAmount": {
    "value": "112.62",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "1364.00",
    "confidence": 0.98
  },
  "supplierGstNo": {
    "value": "M2-0105651-9",
    "confidence": 0.98
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "PSSBNV1 - Stamp Booklet NVI (6.20 * 220) / Postal Services - SALES OF STOCK",
        "confidence": 0.98
      },
      "quantity": {
        "value": "220",
        "confidence": 0.98
      },
      "unitPrice": {
        "value": "5.689",
        "confidence": 0.7
      },
      "amount": {
        "value": "1251.38",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "112.62",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.98
      },
      "accountCode": {
        "value": "6520",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.9
}
```
</details>

---

## Extraction Results - 2026-03-02T03:57:50.934Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | Singapore Post Limited | 0.98 |
| Total Amount | 1364.00 SGD | 0.98 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6520 | 0.80 | PSSBNV1 - Stamp Booklet NVI (6.20 * 220) / Post... |

---

## AI Request - 2026-03-02T04:06:13.728Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 27009ms |
| Input Tokens | 2767 |
| Output Tokens | 1644 |
| Total Tokens | 4411 |
| Estimated Cost | $0.0061 |

<details>
<summary>Response (504 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202515376E",
    "name": "ABZON PTE. LTD.",
    "entityType": "PRIVATE_LIMITED"
  },
  "officers": [
    {
      "name": "Tan Wei Jie",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "appointmentDate": "2026-01-19",
      "cessationDate": null
    },
    {
      "name": "Wong LiQing",
      "role": "DIRECTOR",
      "cessationDate": null
    }
  ],
  "documentMetadata": {
    "receiptNo": "FREE"
  }
}
```
</details>

---

## AI Request - 2026-03-02T04:07:08.609Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 28464ms |
| Input Tokens | 2767 |
| Output Tokens | 1539 |
| Total Tokens | 4306 |
| Estimated Cost | $0.0058 |

<details>
<summary>Response (582 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202515376E",
    "name": "ABZON PTE. LTD.",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE"
  },
  "officers": [
    {
      "name": "Wong LiQing",
      "role": "DIRECTOR",
      "appointmentDate": null,
      "cessationDate": null
    },
    {
      "name": "Tan Wei Jie",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "appointmentDate": "2026-01-19",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE"
  }
}
```
</details>

---

## AI Request - 2026-03-02T04:07:13.578Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 28546ms |
| Input Tokens | 2767 |
| Output Tokens | 1382 |
| Total Tokens | 4149 |
| Estimated Cost | $0.0055 |

<details>
<summary>Response (730 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202515376E",
    "name": "ABZON PTE. LTD.",
    "entityType": "PRIVATE_LIMITED"
  },
  "officers": [
    {
      "name": "Wong LiQing",
      "role": "DIRECTOR",
      "identificationType": null,
      "identificationNumber": null,
      "nationality": null,
      "address": null,
      "appointmentDate": null,
      "cessationDate": null
    },
    {
      "name": "Tan Wei Jie",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": null,
      "address": null,
      "appointmentDate": "2026-01-19",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE"
  }
}
```
</details>

---

## AI Request - 2026-03-02T04:07:19.733Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 30045ms |
| Input Tokens | 2767 |
| Output Tokens | 1708 |
| Total Tokens | 4475 |
| Estimated Cost | $0.0062 |

<details>
<summary>Response (504 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202515376E",
    "name": "ABZON PTE. LTD.",
    "entityType": "PRIVATE_LIMITED"
  },
  "officers": [
    {
      "name": "Tan Wei Jie",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "appointmentDate": "2026-01-19",
      "cessationDate": null
    },
    {
      "name": "Wong LiQing",
      "role": "DIRECTOR",
      "cessationDate": null
    }
  ],
  "documentMetadata": {
    "receiptNo": "FREE"
  }
}
```
</details>

---

## AI Request - 2026-03-02T04:36:49.027Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 44245ms |
| Input Tokens | 8305 |
| Output Tokens | 3679 |
| Total Tokens | 11984 |
| Estimated Cost | $0.0157 |

<details>
<summary>Response (3864 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202527104R",
    "name": "WISDOM APPROACH PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-06-23",
    "incorporationDate": "2025-06-23",
    "registrationDate": "2025-06-23"
  },
  "ssicActivities": {
    "primary": {
      "code": "62013",
      "description": "DEVELOPMENT OF SOFTWARE FOR CYBERSECURITY"
    }
  },
  "registeredAddress": {
    "block": "54",
    "streetName": "CHAI CHEE STREET",
    "level": "14",
    "unit": "861",
    "postalCode": "460054",
    "effectiveFrom": "2025-06-23"
  },
  "paidUpCapital": {
    "amount": 10000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 10000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 2000000,
      "totalValue": 2000,
      "isPaidUp": true,
      "isTreasury": false
    },
    {
      "shareClass": "OTHERS",
      "currency": "SGD",
      "numberOfShares": 8000000,
      "totalValue": 8000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "MINAMOTO TAKAHITO",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "TT3431215",
      "nationality": "JAPANESE",
      "address": "96 HAKATA-CHO, SHINMICHI-DORI, DONGURI-SAGARU, HIGASHIYAMA-KU, KYOTO CITY, KYOTO 605-0805",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000000,
      "percentageHeld": 10,
      "currency": "SGD"
    },
    {
      "name": "MINAMOTO TAKAHITO",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "TT3431215",
      "nationality": "JAPANESE",
      "address": "96 HAKATA-CHO, SHINMICHI-DORI, DONGURI-SAGARU, HIGASHIYAMA-KU, KYOTO CITY, KYOTO 605-0805",
      "shareClass": "OTHERS",
      "numberOfShares": 1500000,
      "percentageHeld": 15,
      "currency": "SGD"
    },
    {
      "name": "TAN BRIAN ROY",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7409663H",
      "nationality": "SINGAPORE",
      "address": "54 CHAI CHEE STREET, #14-861, SINGAPORE 460054",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000000,
      "percentageHeld": 10,
      "currency": "SGD"
    },
    {
      "name": "TAN BRIAN ROY",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7409663H",
      "nationality": "SINGAPORE",
      "address": "54 CHAI CHEE STREET, #14-861, SINGAPORE 460054",
      "shareClass": "OTHERS",
      "numberOfShares": 6500000,
      "percentageHeld": 65,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "MINAMOTO TAKAHITO",
      "role": "DIRECTOR",
      "identificationType": "PASSPORT",
      "identificationNumber": "TT3431215",
      "nationality": "JAPANESE",
      "address": "96 HAKATA-CHO, SHINMICHI-DORI, DONGURI-SAGARU, HIGASHIYAMA-KU, KYOTO CITY, KYOTO 605-0805",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    },
    {
      "name": "TAN BRIAN ROY",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7409663H",
      "nationality": "SINGAPORE",
      "address": "54 CHAI CHEE STREET, #14-861, SINGAPORE 460054",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    },
    {
      "name": "TAN HWA SENG",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S1290845H",
      "nationality": "SINGAPORE",
      "address": "469A BUKIT BATOK WEST AVENUE 9, #15-421, SINGAPORE 651469",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA251023004413",
    "receiptDate": "2025-10-23"
  }
}
```
</details>

---

## AI Request - 2026-03-02T04:56:46.192Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 53717ms |
| Input Tokens | 9412 |
| Output Tokens | 3809 |
| Total Tokens | 13221 |
| Estimated Cost | $0.0170 |

<details>
<summary>Response (4543 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202425650M",
    "name": "INCARTA SG PTE. LTD.",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-06-26",
    "incorporationDate": "2024-06-26",
    "registrationDate": "2024-06-26"
  },
  "ssicActivities": {
    "primary": {
      "code": "47729",
      "description": "RETAIL SALE OF PHARMACEUTICAL AND MEDICAL GOODS N.E.C."
    },
    "secondary": {
      "code": "32501",
      "description": "MANUFACTURE OF MEDICAL RESEARCH AND CLINICAL DIAGNOSTIC INSTRUMENTS AND SUPPLIES (EG REAGENTS)"
    }
  },
  "registeredAddress": {
    "block": "12",
    "streetName": "WOODLANDS SQUARE",
    "level": "12",
    "unit": "85",
    "buildingName": "WOODS SQUARE",
    "postalCode": "737715",
    "effectiveFrom": "2024-06-26"
  },
  "paidUpCapital": {
    "amount": 0,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 1000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 1000,
      "isPaidUp": false,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "NICHOLAS RAYMOND THOMAS YOUNG",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "PA9551504",
      "nationality": "AUSTRALIAN",
      "address": "UNIT 3, 165 HEATHERDALE ROAD, VERMONT, VIC 3133, AUSTRALIA",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 10,
      "currency": "SGD"
    },
    {
      "name": "KIM MICHELLE YOUNG",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "PB4188632",
      "nationality": "AUSTRALIAN",
      "address": "UNIT 3, 165 HEATHERDALE ROAD, VERMONT, VIC 3133, AUSTRALIA",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 10,
      "currency": "SGD"
    },
    {
      "name": "MARCUS RAYMOND THOMAS YOUNG",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "PB5305307",
      "nationality": "AUSTRALIAN",
      "address": "UNIT 3, 165 HEATHERDALE ROAD, VERMONT, VIC 3133, AUSTRALIA",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 10,
      "currency": "SGD"
    },
    {
      "name": "QUINTESSA HOLDINGS PTY LTD",
      "type": "CORPORATE",
      "identificationType": "OTHER",
      "identificationNumber": "T24UF6036K",
      "placeOfOrigin": "AUSTRALIA",
      "address": "SUITE 2, 142 CANTERBURY ROAD, HEATHMONT, VIC 3135, AUSTRALIA",
      "shareClass": "ORDINARY",
      "numberOfShares": 700,
      "percentageHeld": 70,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "MARCUS RAYMOND THOMAS YOUNG",
      "role": "DIRECTOR",
      "identificationType": "PASSPORT",
      "identificationNumber": "PB5305307",
      "nationality": "AUSTRALIAN",
      "address": "UNIT 3, 165 HEATHERDALE ROAD, VERMONT, VIC 3133, AUSTRALIA",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    },
    {
      "name": "NICHOLAS RAYMOND THOMAS YOUNG",
      "role": "DIRECTOR",
      "identificationType": "PASSPORT",
      "identificationNumber": "PA9551504",
      "nationality": "AUSTRALIAN",
      "address": "UNIT 3, 165 HEATHERDALE ROAD, VERMONT, VIC 3133, AUSTRALIA",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    },
    {
      "name": "NICHOLAS RAYMOND THOMAS YOUNG",
      "role": "CEO",
      "identificationType": "PASSPORT",
      "identificationNumber": "PA9551504",
      "nationality": "AUSTRALIAN",
      "address": "UNIT 3, 165 HEATHERDALE ROAD, VERMONT, VIC 3133, AUSTRALIA",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    },
    {
      "name": "GOH SIN WEI",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7926831C",
      "nationality": "SINGAPORE",
      "address": "21 SEMBAWANG CRESCENT #03-03 PARC LIFE SINGAPORE (757053)",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    },
    {
      "name": "GOH SIN WEI",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7926831C",
      "nationality": "SINGAPORE",
      "address": "21 SEMBAWANG CRESCENT #03-03 PARC LIFE SINGAPORE (757053)",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA240626120546",
    "receiptDate": "2024-06-26"
  }
}
```
</details>

---

## AI Request - 2026-03-02T06:10:30.840Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| User | 8820e69e-8cb6-40dd-a4cf-1d670be4ecf9 |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 27241ms |
| Input Tokens | 6812 |
| Output Tokens | 1960 |
| Total Tokens | 8772 |
| Estimated Cost | $0.0107 |

<details>
<summary>Response (1796 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE",
    "confidence": 0.9
  },
  "documentSubCategory": {
    "value": "PURCHASE_ORDER",
    "confidence": 0.88
  },
  "vendorName": {
    "value": "HOTALI PRINTING (JM 0621426-K)",
    "confidence": 0.95
  },
  "customerName": {
    "value": "OAKTREE ACCOUNTING & CORPORATE SOLUTIONS PTE. LTD.",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "SO-01372",
    "confidence": 0.98
  },
  "documentDate": {
    "value": "2026-02-26",
    "confidence": 0.95
  },
  "dueDate": null,
  "currency": {
    "value": "MYR",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "625.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "625.00",
    "confidence": 0.98
  },
  "supplierGstNo": {
    "value": null,
    "confidence": 0.9
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "PRINT - A4 - letter 80gsm simili paper; Printing B/W 1side; Each x 1pc; Finishing - fold to DL size; Mailer - Feb 26 exercise (incorp) Qty 1893; Mailer - Feb 26 exercise (AR) Qty 316; Mailer - Feb 26 exercise (manual) Qty 291",
        "confidence": 0.95
      },
      "quantity": {
        "value": "2500.00",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "0.25",
        "confidence": 0.95
      },
      "amount": {
        "value": "625.00",
        "confidence": 0.98
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
        "value": "6510",
        "confidence": 0.7
      }
    }
  ],
  "overallConfidence": 0.86
}
```
</details>

---

## Extraction Results - 2026-03-02T06:10:58.095Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.90 |
| Vendor | HOTALI PRINTING (JM 0621426-K) | 0.95 |
| Total Amount | 625.00 MYR | 0.98 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6510 | 0.70 | PRINT - A4 - letter 80gsm simili paper; Printin... |

---

## AI Request - 2026-03-02T06:28:41.950Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 49837ms |
| Input Tokens | 7310 |
| Output Tokens | 3259 |
| Total Tokens | 10569 |
| Estimated Cost | $0.0138 |

<details>
<summary>Response (3631 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202514180G",
    "name": "KIMTAN LABS PTE. LTD.",
    "formerName": "",
    "dateOfNameChange": "",
    "formerNames": [],
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-04-02",
    "incorporationDate": "2025-04-02",
    "registrationDate": "2025-04-02"
  },
  "ssicActivities": {
    "primary": {
      "code": "46900",
      "description": "WHOLESALE TRADE OF A VARIETY OF GOODS WITHOUT A DOMINANT PRODUCT"
    },
    "secondary": {
      "code": "77400",
      "description": "LEASING OF NON-FINANCIAL INTANGIBLE ASSETS (E.G. PATENTS, TRADE MARKS, BRAND NAMES ETC)"
    }
  },
  "registeredAddress": {
    "block": "8",
    "streetName": "ALEXANDRA VIEW",
    "level": "22",
    "unit": "07",
    "buildingName": "THE METROPOLITAN CONDOMINIUM",
    "postalCode": "158747",
    "effectiveFrom": "2025-05-01"
  },
  "paidUpCapital": {
    "amount": 5000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 5000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 1000000,
      "totalValue": 5000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "IFACE LIMITLESS PTE. LTD.",
      "type": "CORPORATE",
      "identificationType": "UEN",
      "identificationNumber": "202303431R",
      "nationality": "SINGAPORE",
      "placeOfOrigin": "SINGAPORE",
      "address": "10 ANSON ROAD, #33-10, INTERNATIONAL PLAZA, SINGAPORE 079903",
      "shareClass": "ORDINARY",
      "numberOfShares": 250000,
      "percentageHeld": 25,
      "currency": "SGD"
    },
    {
      "name": "TAN SU-YU, MICHELLE (CHEN SUYU)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8623295B",
      "nationality": "SINGAPORE",
      "placeOfOrigin": "",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "shareClass": "ORDINARY",
      "numberOfShares": 750000,
      "percentageHeld": 75,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "ISHWINDER SINGH",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7655906F",
      "nationality": "SINGAPORE",
      "address": "121 TANJONG RHU ROAD, #18-35, TANJONG RIA CONDOMINIUM, SINGAPORE 436914",
      "appointmentDate": "2025-04-02",
      "cessationDate": null
    },
    {
      "name": "KIM DO WAN",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9287158D",
      "nationality": "AMERICAN",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "appointmentDate": "2025-04-02",
      "cessationDate": null
    },
    {
      "name": "SABA KHAN",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7686336I",
      "nationality": "INDIAN",
      "address": "8 MARINA VIEW, #43-068, ASIA SQUARE TOWER 1, SINGAPORE 018960",
      "appointmentDate": "2025-04-02",
      "cessationDate": null
    },
    {
      "name": "TAN SU-YU, MICHELLE (CHEN SUYU)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8623295B",
      "nationality": "SINGAPORE",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "appointmentDate": "2025-04-02",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA250922001833",
    "receiptDate": "2025-09-22"
  }
}
```
</details>

---

## AI Request - 2026-03-02T06:38:08.647Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 46820ms |
| Input Tokens | 7047 |
| Output Tokens | 2778 |
| Total Tokens | 9825 |
| Estimated Cost | $0.0126 |

<details>
<summary>Response (2005 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202527414M",
    "name": "KWANTUM DIGITAL TECHNOLOGIES PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-06-25",
    "incorporationDate": "2025-06-25",
    "registrationDate": "2025-06-25"
  },
  "ssicActivities": {
    "primary": {
      "code": "62011",
      "description": "DEVELOPMENT OF SOFTWARE AND APPLICATIONS (EXCEPT GAMES AND CYBERSECURITY)"
    },
    "secondary": {
      "code": "62021",
      "description": "INFORMATION TECHNOLOGY CONSULTANCY (EXCEPT CYBERSECURITY)"
    }
  },
  "registeredAddress": {
    "block": "60",
    "streetName": "PAYA LEBAR ROAD",
    "level": "06",
    "unit": "28",
    "buildingName": "PAYA LEBAR SQUARE",
    "postalCode": "409051",
    "effectiveFrom": "2025-11-17"
  },
  "paidUpCapital": {
    "amount": 60000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 150000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 150000,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "DEVAKI RAMANATHAN",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7074618B",
      "nationality": "INDIAN",
      "address": "205 RIVER VALLEY ROAD, #06-63, UE SQUARE (PARK WING), SINGAPORE 238274",
      "shareClass": "ORDINARY",
      "numberOfShares": 150000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "DEVAKI RAMANATHAN",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7074618B",
      "nationality": "INDIAN",
      "address": "205 RIVER VALLEY ROAD, #06-63, UE SQUARE (PARK WING), SINGAPORE 238274",
      "appointmentDate": "2025-06-25",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA251208002143",
    "receiptDate": "2025-12-08"
  }
}
```
</details>

---

## AI Request - 2026-03-02T06:45:52.641Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 41612ms |
| Input Tokens | 5609 |
| Output Tokens | 2759 |
| Total Tokens | 8368 |
| Estimated Cost | $0.0111 |

<details>
<summary>Response (3212 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202527032W",
    "name": "MYLIFESTYLE SANITARY PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-06-23",
    "incorporationDate": "2025-06-23",
    "registrationDate": "2025-06-23"
  },
  "ssicActivities": {
    "primary": {
      "code": "47529",
      "description": "RETAIL SALE OF HARDWARE, PAINT AND GLASS N.E.C. (E.G. WOOD, GLASS, SANITARY WARE, DO-IT-YOURSELF MATERIALS)"
    }
  },
  "registeredAddress": {
    "block": "1",
    "streetName": "THOMSON ROAD",
    "level": "#04-348G",
    "unit": null,
    "buildingName": "BALESTIER HILL SHOPPING CENTRE",
    "postalCode": "300001",
    "effectiveFrom": "2025-06-23"
  },
  "paidUpCapital": {
    "amount": 100000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 100000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 100000,
      "totalValue": 100000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "TAN MEI JUN, DAPHNE (CHEN MEIJUN, DAPHNE)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8413024I",
      "nationality": "SINGAPORE",
      "address": "1 THOMSON ROAD, #04-348G, BALESTIER HILL SHOPPING CENTRE, SINGAPORE 300001",
      "shareClass": "ORDINARY",
      "numberOfShares": 51000,
      "percentageHeld": 51,
      "currency": "SGD"
    },
    {
      "name": "TAN TIAN HOCK (CHEN TIANFU)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7416573G",
      "nationality": "SINGAPORE",
      "address": "965 UPPER CHANGI ROAD NORTH, #01-33, SINGAPORE 507665",
      "shareClass": "ORDINARY",
      "numberOfShares": 49000,
      "percentageHeld": 49,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "TAN MEI JUN, DAPHNE (CHEN MEIJUN, DAPHNE)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8413024I",
      "nationality": "SINGAPORE",
      "address": "1 THOMSON ROAD, #04-348G, BALESTIER HILL SHOPPING CENTRE, SINGAPORE 300001",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    },
    {
      "name": "TAN TIAN HOCK (CHEN TIANFU)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7416573G",
      "nationality": "SINGAPORE",
      "address": "965 UPPER CHANGI ROAD NORTH, #01-33, SINGAPORE 507665",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    },
    {
      "name": "TAN TIAN HOCK (CHEN TIANFU)",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7416573G",
      "nationality": "SINGAPORE",
      "address": "965 UPPER CHANGI ROAD NORTH, #01-33, SINGAPORE 507665",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "compliance": {
    "lastAgmDate": null,
    "lastArFiledDate": null,
    "fyeAsAtLastAr": null,
    "accountsDueDate": null
  },
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-06-23"
  }
}
```
</details>

---

## AI Request - 2026-03-02T06:49:03.989Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 34824ms |
| Input Tokens | 7113 |
| Output Tokens | 2036 |
| Total Tokens | 9149 |
| Estimated Cost | $0.0112 |

<details>
<summary>Response (2429 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202534290K",
    "name": "NEXLIFY HR PTE. LTD.",
    "formerName": "",
    "dateOfNameChange": "",
    "formerNames": [],
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-08-06",
    "incorporationDate": "2025-08-06",
    "registrationDate": "2025-08-06"
  },
  "ssicActivities": {
    "primary": {
      "code": "78104",
      "description": "EMPLOYMENT AGENCIES (EXCLUDING DOMESTIC WORKER EMPLOYMENT PLACEMENT AGENCIES AND ONLINE MARKETPLACES)"
    },
    "secondary": {
      "code": "70204",
      "description": "HUMAN RESOURCE CONSULTANCY SERVICES"
    }
  },
  "registeredAddress": {
    "block": "21",
    "streetName": "BUKIT BATOK CRESCENT",
    "level": "25",
    "unit": "72",
    "buildingName": "WCEGA TOWER",
    "postalCode": "658065",
    "effectiveFrom": "2025-08-06"
  },
  "paidUpCapital": {
    "amount": 20000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 20000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 20000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "LIM YAH PING (LIN YAPING)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8125884H",
      "nationality": "SINGAPORE",
      "placeOfOrigin": "",
      "address": "10P BRADDELL HILL, #04-68, BRADDELL VIEW, SINGAPORE 579733",
      "shareClass": "ORDINARY",
      "numberOfShares": 20000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "LIM YAH PING (LIN YAPING)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8125884H",
      "nationality": "SINGAPORE",
      "address": "10P BRADDELL HILL, #04-68, BRADDELL VIEW, SINGAPORE 579733",
      "appointmentDate": "2025-08-06",
      "cessationDate": null
    },
    {
      "name": "TAN WEI JIE",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "SINGAPORE",
      "address": "21 BUKIT BATOK CRESCENT, #25-72, WCEGA TOWER, SINGAPORE 658065",
      "appointmentDate": "2025-08-06",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-08-06"
  }
}
```
</details>

---

