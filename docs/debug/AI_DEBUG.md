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

## AI Request - 2026-03-02T14:26:33.929Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 46420ms |
| Input Tokens | 6972 |
| Output Tokens | 2157 |
| Total Tokens | 9129 |
| Estimated Cost | $0.0113 |

<details>
<summary>Response (1824 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202515376E",
    "name": "ABZON PTE. LTD.",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-04-09",
    "incorporationDate": "2025-04-09",
    "registrationDate": "2025-04-09"
  },
  "ssicActivities": {
    "primary": {
      "code": "74909",
      "description": "OTHER PROFESSIONAL, SCIENTIFIC AND TECHNICAL ACTIVITIES N.E.C."
    }
  },
  "registeredAddress": {
    "block": "60",
    "streetName": "PAYA LEBAR ROAD",
    "level": "06",
    "unit": "28",
    "buildingName": "PAYA LEBAR SQUARE",
    "postalCode": "409051",
    "effectiveFrom": "2025-11-01"
  },
  "paidUpCapital": {
    "amount": 10,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 100,
      "parValue": 1,
      "totalValue": 100,
      "isPaidUp": false,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "CHOPRA KARAN SUNIL",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8256090D",
      "nationality": "SINGAPORE",
      "address": "55 PIPIT ROAD, #2-2, SINGAPORE 370055",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "WONG LIQING",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8819252D",
      "nationality": "SINGAPORE",
      "address": "55 PIPIT ROAD, #2-2, SINGAPORE 370055",
      "appointmentDate": "2025-07-01",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA260119001302",
    "receiptDate": "2026-01-19"
  }
}
```
</details>

---

## AI Request - 2026-03-02T14:26:19.275Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 76165ms |
| Input Tokens | 7132 |
| Output Tokens | 3543 |
| Total Tokens | 10675 |
| Estimated Cost | $0.0142 |

<details>
<summary>Response (2679 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "201943184W",
    "name": "88 DURIAN FRUIT PTE. LTD.",
    "formerName": "88 DRUIAN & FRUITS PTE. LTD.",
    "dateOfNameChange": "2020-01-04",
    "formerNames": [
      {
        "name": "88 DRUIAN & FRUITS PTE. LTD.",
        "effectiveFrom": "2019-12-21",
        "effectiveTo": "2020-01-04"
      }
    ],
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2019-12-21",
    "incorporationDate": "2019-12-21",
    "registrationDate": "2019-12-21"
  },
  "ssicActivities": {
    "primary": {
      "code": "47211",
      "description": "RETAIL SALE OF FRUITS AND VEGETABLES"
    }
  },
  "registeredAddress": {
    "block": "88",
    "streetName": "WHAMPOA DRIVE",
    "level": "01",
    "unit": "853",
    "postalCode": "320088",
    "effectiveFrom": "2025-01-24"
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
      "numberOfShares": 5000,
      "totalValue": 5000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "NG MAN TING",
      "type": "INDIVIDUAL",
      "identificationType": "OTHER",
      "identificationNumber": "S8759501C",
      "nationality": "MALAYSIAN",
      "address": "677C YISHUN RING ROAD, #05-1962, PARK GROVE @ YISHUN, SINGAPORE 763677",
      "shareClass": "ORDINARY",
      "numberOfShares": 5000,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "LIM WEI SIANG",
      "role": "SECRETARY",
      "identificationType": "OTHER",
      "identificationNumber": "S8369742C",
      "nationality": "MALAYSIAN",
      "address": "88 WHAMPOA DRIVE, #01-853, SINGAPORE 320088",
      "appointmentDate": "2025-01-24",
      "cessationDate": null
    },
    {
      "name": "NG MAN TING",
      "role": "DIRECTOR",
      "identificationType": "OTHER",
      "identificationNumber": "S8759501C",
      "nationality": "MALAYSIAN",
      "address": "677C YISHUN RING ROAD, #05-1962, PARK GROVE @ YISHUN, SINGAPORE 763677",
      "appointmentDate": "2025-01-24",
      "cessationDate": null
    },
    {
      "name": "HO WEI XIONG",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S8942737A",
      "nationality": "SINGAPORE",
      "address": "924 HOUGANG AVENUE 9, #07-68, SINGAPORE 530924",
      "appointmentDate": "2019-12-21",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA260130003906",
    "receiptDate": "2026-01-30"
  }
}
```
</details>

---

## AI Request - 2026-03-02T14:36:44.499Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 47657ms |
| Input Tokens | 7135 |
| Output Tokens | 2677 |
| Total Tokens | 9812 |
| Estimated Cost | $0.0125 |

<details>
<summary>Response (2672 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202519163R",
    "name": "AI 4 SOLUTIONS PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-05-02",
    "incorporationDate": "2025-05-02"
  },
  "ssicActivities": {
    "primary": {
      "code": "62011",
      "description": "DEVELOPMENT OF SOFTWARE AND APPLICATIONS (EXCEPT GAMES AND CYBERSECURITY)"
    },
    "secondary": {
      "code": "74909",
      "description": "OTHER PROFESSIONAL, SCIENTIFIC AND TECHNICAL ACTIVITIES N.E.C."
    }
  },
  "registeredAddress": {
    "block": "11",
    "streetName": "COLLYER QUAY",
    "level": "03",
    "unit": "07",
    "buildingName": "THE ARCADE",
    "postalCode": "049317",
    "effectiveFrom": "2025-05-02"
  },
  "paidUpCapital": {
    "amount": 1,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 1,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 150000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "AI FOR SOLUTIONS PTY LTD",
      "type": "CORPORATE",
      "identificationType": "OTHER",
      "identificationNumber": "AU-689580630",
      "nationality": "AUSTRALIA",
      "placeOfOrigin": "AUSTRALIA",
      "address": "26 KUMBA STREET FLETCHER NSW 2287, AUSTRALIA",
      "shareClass": "ORDINARY",
      "numberOfShares": 150000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "CEO",
      "identificationType": "NRIC",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02",
      "cessationDate": null
    },
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02",
      "cessationDate": null
    },
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA250807001467",
    "receiptDate": "2025-08-07"
  }
}
```
</details>

---

## AI Request - 2026-03-02T14:36:51.462Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 48445ms |
| Input Tokens | 7003 |
| Output Tokens | 2217 |
| Total Tokens | 9220 |
| Estimated Cost | $0.0114 |

<details>
<summary>Response (2015 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202523367H",
    "name": "AURION DIGITAL CORE PTE. LTD.",
    "formerName": "",
    "dateOfNameChange": "",
    "formerNames": [],
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-05-28",
    "incorporationDate": "2025-05-28",
    "registrationDate": "2025-05-28"
  },
  "ssicActivities": {
    "primary": {
      "code": "62021",
      "description": "INFORMATION TECHNOLOGY CONSULTANCY (EXCEPT CYBERSECURITY)"
    }
  },
  "registeredAddress": {
    "block": "39",
    "streetName": "EWE BOON ROAD",
    "level": "07",
    "unit": "06",
    "buildingName": "",
    "postalCode": "259334",
    "effectiveFrom": "2025-05-28",
    "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334"
  },
  "paidUpCapital": {
    "amount": 1000,
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
      "totalValue": 1000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "LAU CHEE SAM (LIU ZHISEN)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7970335D",
      "nationality": "SINGAPORE",
      "placeOfOrigin": "",
      "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "LAU CHEE SAM (LIU ZHISEN)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7970335D",
      "nationality": "SINGAPORE",
      "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334",
      "appointmentDate": "2025-05-28",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "compliance": {},
  "charges": [],
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-05-28"
  }
}
```
</details>

---

## AI Request - 2026-03-02T14:36:59.087Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 45859ms |
| Input Tokens | 6991 |
| Output Tokens | 2110 |
| Total Tokens | 9101 |
| Estimated Cost | $0.0112 |

<details>
<summary>Response (2085 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202523176C",
    "name": "AURION ID PTE. LTD.",
    "formerName": "",
    "dateOfNameChange": "",
    "formerNames": [],
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-05-28",
    "incorporationDate": "2025-05-28",
    "registrationDate": "2025-05-28"
  },
  "ssicActivities": {
    "primary": {
      "code": "62011",
      "description": "DEVELOPMENT OF SOFTWARE AND APPLICATIONS (EXCEPT GAMES AND CYBERSECURITY)"
    }
  },
  "registeredAddress": {
    "block": "39",
    "streetName": "EWE BOON ROAD",
    "level": "07",
    "unit": "06",
    "buildingName": "",
    "postalCode": "259334",
    "effectiveFrom": "2025-05-28"
  },
  "paidUpCapital": {
    "amount": 1000,
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
      "parValue": 1,
      "totalValue": 1000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "LAU CHEE SAM (LIU ZHISEN)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7970335D",
      "nationality": "SINGAPORE",
      "placeOfOrigin": "",
      "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "LAU CHEE SAM (LIU ZHISEN)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7970335D",
      "nationality": "SINGAPORE",
      "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334",
      "appointmentDate": "2025-05-28",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "compliance": {
    "lastAgmDate": "",
    "lastArFiledDate": "",
    "fyeAsAtLastAr": "",
    "accountsDueDate": ""
  },
  "charges": [],
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-05-28"
  }
}
```
</details>

---

## AI Request - 2026-03-02T14:37:04.775Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 44405ms |
| Input Tokens | 7149 |
| Output Tokens | 2335 |
| Total Tokens | 9484 |
| Estimated Cost | $0.0118 |

<details>
<summary>Response (2515 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202522933W",
    "name": "AURION INTELLECTUAL PTE. LTD.",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-05-27",
    "incorporationDate": "2025-05-27",
    "registrationDate": "2025-05-27"
  },
  "ssicActivities": {
    "primary": {
      "code": "62011",
      "description": "DEVELOPMENT OF SOFTWARE AND APPLICATIONS (EXCEPT GAMES AND CYBERSECURITY)"
    }
  },
  "registeredAddress": {
    "block": "39",
    "streetName": "EWE BOON ROAD",
    "level": "07",
    "unit": "06",
    "postalCode": "259334",
    "effectiveFrom": "2025-05-27",
    "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334"
  },
  "paidUpCapital": {
    "amount": 1000,
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
      "totalValue": 1000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "LAU CHEE SAM (LIU ZHISEN)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7970335D",
      "nationality": "SINGAPORE",
      "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "LAU CHEE SAM (LIU ZHISEN)",
      "role": "CHIEF_EXECUTIVE_OFFICER",
      "identificationType": "NRIC",
      "identificationNumber": "S7970335D",
      "nationality": "SINGAPORE",
      "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334",
      "appointmentDate": "2025-05-27",
      "cessationDate": null
    },
    {
      "name": "LAU CHEE SAM (LIU ZHISEN)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7970335D",
      "nationality": "SINGAPORE",
      "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334",
      "appointmentDate": "2025-05-27",
      "cessationDate": null
    },
    {
      "name": "LAU CHEE SAM (LIU ZHISEN)",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7970335D",
      "nationality": "SINGAPORE",
      "address": "39 EWE BOON ROAD, #07-06, SINGAPORE 259334",
      "appointmentDate": "2025-05-27",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-05-27"
  }
}
```
</details>

---

## AI Request - 2026-03-02T14:36:47.313Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 81427ms |
| Input Tokens | 7301 |
| Output Tokens | 3284 |
| Total Tokens | 10585 |
| Estimated Cost | $0.0139 |

<details>
<summary>Response (3757 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "200416459H",
    "name": "AKAI PRECISION ENGINEERING PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2004-12-22",
    "incorporationDate": "2004-12-22",
    "registrationDate": "2004-12-22"
  },
  "ssicActivities": {
    "primary": {
      "code": "28223",
      "description": "MANUFACTURE OF DIES, MOULDS, TOOLS, JIGS AND FIXTURES"
    },
    "secondary": {
      "code": "28221",
      "description": "MANUFACTURE AND REPAIR OF MACHINERY AND MACHINE-TOOLS - METAL CUTTING TYPES (E.G. LATHES, MILLING MACHINES, SHAPING MACHINES)"
    }
  },
  "registeredAddress": {
    "block": "2",
    "streetName": "Woodlands Sector 1",
    "level": "03",
    "unit": "02",
    "buildingName": "Woodlands Spectrum",
    "postalCode": "738068",
    "effectiveFrom": "2016-07-08"
  },
  "paidUpCapital": {
    "amount": 231000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 231000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 231000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "TAN YONG KAI",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S1135060G",
      "nationality": "Singapore",
      "address": "429 BUKIT PANJANG RING ROAD, #11-715, SINGAPORE 670429",
      "shareClass": "ORDINARY",
      "numberOfShares": 115500,
      "percentageHeld": 50,
      "currency": "SGD"
    },
    {
      "name": "TIEW BENG CHUAN",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7075009J",
      "nationality": "Singapore",
      "address": "670 WOODLANDS DRIVE 71, #05-19, SINGAPORE 730670",
      "shareClass": "ORDINARY",
      "numberOfShares": 115500,
      "percentageHeld": 50,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "TIEW BENG CHUAN",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7075009J",
      "nationality": "Singapore",
      "address": "670 WOODLANDS DRIVE 71, #05-19, SINGAPORE 730670",
      "appointmentDate": "2013-03-08",
      "cessationDate": null
    },
    {
      "name": "TEO CHOR HUA",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S1325713B",
      "nationality": "Singapore",
      "address": "336 SMITH STREET, #05-311, NEW BRIDGE CENTRE, SINGAPORE 050336",
      "appointmentDate": "2011-04-06",
      "cessationDate": null
    },
    {
      "name": "TAN YONG KAI",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S1135060G",
      "nationality": "Singapore",
      "address": "429 BUKIT PANJANG RING ROAD, #11-715, SINGAPORE 670429",
      "appointmentDate": "2004-12-22",
      "cessationDate": null
    }
  ],
  "financialYear": {
    "endDay": 31,
    "endMonth": 12
  },
  "homeCurrency": "SGD",
  "compliance": {
    "lastAgmDate": "2025-06-26",
    "lastArFiledDate": "2025-07-18",
    "fyeAsAtLastAr": "2024-12-31"
  },
  "charges": [
    {
      "chargeNumber": "C202403464",
      "chargeHolderName": "UNITED OVERSEAS BANK LIMITED",
      "amountSecuredText": "ALL MONIES",
      "currency": "SGD",
      "registrationDate": "2024-04-02",
      "dischargeDate": null
    },
    {
      "chargeNumber": "C202403823",
      "chargeHolderName": "UNITED OVERSEAS BANK LIMITED",
      "amountSecuredText": "ALL MONIES",
      "currency": "SGD",
      "registrationDate": "2024-04-11",
      "dischargeDate": null
    }
  ],
  "documentMetadata": {
    "receiptNo": "ACRA250821002073",
    "receiptDate": "2025-08-21"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:05:16.850Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 43527ms |
| Input Tokens | 6990 |
| Output Tokens | 2146 |
| Total Tokens | 9136 |
| Estimated Cost | $0.0113 |

<details>
<summary>Response (1772 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202523161N",
    "name": "CC HAIR SALON PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-05-27",
    "incorporationDate": "2025-05-27",
    "registrationDate": "2025-05-27"
  },
  "ssicActivities": {
    "primary": {
      "code": "96021",
      "description": "HAIRDRESSING SALONS/SHOPS (INCLUDING BARBER SHOPS)"
    }
  },
  "registeredAddress": {
    "block": "530",
    "streetName": "HOUGANG AVENUE 6",
    "level": "03",
    "unit": "271",
    "postalCode": "530530",
    "effectiveFrom": "2025-05-27"
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
      "numberOfShares": 5000,
      "totalValue": 5000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "ZHU FANGYUE",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8361054I",
      "nationality": "CHINESE",
      "address": "528 HOUGANG AVENUE 6, #06-188, SINGAPORE 530528",
      "shareClass": "ORDINARY",
      "numberOfShares": 5000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "ZHU FANGYUE",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8361054I",
      "nationality": "CHINESE",
      "address": "528 HOUGANG AVENUE 6, #06-188, SINGAPORE 530528",
      "appointmentDate": "2025-05-27",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-05-27"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:05:22.829Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 51832ms |
| Input Tokens | 7249 |
| Output Tokens | 3414 |
| Total Tokens | 10663 |
| Estimated Cost | $0.0141 |

<details>
<summary>Response (3267 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "201927349Z",
    "name": "CLICKSHARE MEDIA VENTURES PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2019-08-21",
    "incorporationDate": "2019-08-21",
    "registrationDate": "2019-08-21"
  },
  "ssicActivities": {
    "primary": {
      "code": "47711",
      "description": "RETAIL SALE OF CLOTHING FOR ADULTS"
    },
    "secondary": {
      "code": "70201",
      "description": "MANAGEMENT CONSULTANCY SERVICES"
    }
  },
  "registeredAddress": {
    "block": "8",
    "streetName": "ALEXANDRA VIEW",
    "level": "22",
    "unit": "07",
    "buildingName": "THE METROPOLITAN CONDOMINIUM",
    "postalCode": "158747",
    "effectiveFrom": "2024-11-01"
  },
  "paidUpCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 100,
      "totalValue": 100,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "KIM DO WAN",
      "type": "INDIVIDUAL",
      "identificationType": "OTHER",
      "identificationNumber": "S9287158D",
      "nationality": "AMERICAN",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "shareClass": "ORDINARY",
      "numberOfShares": 50,
      "percentageHeld": 50,
      "currency": "SGD"
    },
    {
      "name": "TAN SU-YU, MICHELLE (CHEN SUYU)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8623295B",
      "nationality": "SINGAPORE",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "shareClass": "ORDINARY",
      "numberOfShares": 50,
      "percentageHeld": 50,
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
      "appointmentDate": "2022-11-15",
      "cessationDate": null
    },
    {
      "name": "SABA KHAN",
      "role": "SECRETARY",
      "identificationType": "OTHER",
      "identificationNumber": "S7686336I",
      "nationality": "INDIAN",
      "address": "8 MARINA VIEW, #43-068, ASIA SQUARE TOWER 1, SINGAPORE 018960",
      "appointmentDate": "2022-11-15",
      "cessationDate": null
    },
    {
      "name": "TAN SU-YU, MICHELLE (CHEN SUYU)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8623295B",
      "nationality": "SINGAPORE",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "appointmentDate": "2019-08-21",
      "cessationDate": null
    }
  ],
  "financialYear": {
    "endDay": 31,
    "endMonth": 12
  },
  "homeCurrency": "SGD",
  "compliance": {
    "lastAgmDate": "2025-05-30",
    "lastArFiledDate": "2025-05-30",
    "fyeAsAtLastAr": "2024-12-31"
  },
  "documentMetadata": {
    "receiptNo": "ACRA251017002587",
    "receiptDate": "2025-10-17"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:05:27.788Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 47104ms |
| Input Tokens | 7131 |
| Output Tokens | 2879 |
| Total Tokens | 10010 |
| Estimated Cost | $0.0129 |

<details>
<summary>Response (2444 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202038514D",
    "name": "COACH BAHMAN - INTERNATIONAL COACHING SERVICES PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2020-11-27",
    "incorporationDate": "2020-11-27",
    "registrationDate": "2020-11-27"
  },
  "ssicActivities": {
    "primary": {
      "code": "85409",
      "description": "TRAINING COURSES N.E.C."
    }
  },
  "registeredAddress": {
    "block": "160",
    "streetName": "ROBINSON ROAD",
    "level": "14",
    "unit": "04",
    "buildingName": "SINGAPORE BUSINESS FEDERATION CENTER",
    "postalCode": "068914",
    "effectiveFrom": "2020-11-27"
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
      "numberOfShares": 10000,
      "totalValue": 10000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "WOO SEE KHAI (WU SHIKAI)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8706285F",
      "nationality": "SINGAPORE",
      "address": "221A SUMANG LANE, #05-19, MATILDA EDGE, SINGAPORE 821221",
      "shareClass": "ORDINARY",
      "numberOfShares": 10000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "ROSY OMAR SALEH",
      "role": "SECRETARY",
      "identificationType": "FIN",
      "identificationNumber": "S7289072H",
      "nationality": "INDONESIAN",
      "address": "160 ROBINSON ROAD, #14-04, SINGAPORE BUSINESS FEDERATION CENTER, SINGAPORE 068914",
      "appointmentDate": "2020-11-27",
      "cessationDate": null
    },
    {
      "name": "WOO SEE KHAI (WU SHIKAI)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8706285F",
      "nationality": "SINGAPORE",
      "address": "221A SUMANG LANE, #05-19, MATILDA EDGE, SINGAPORE 821221",
      "appointmentDate": "2020-11-27",
      "cessationDate": null
    }
  ],
  "financialYear": {
    "endDay": 31,
    "endMonth": 10
  },
  "homeCurrency": "SGD",
  "compliance": {
    "lastAgmDate": "2025-04-10",
    "lastArFiledDate": "2025-04-14",
    "fyeAsAtLastAr": "2024-10-31"
  },
  "documentMetadata": {
    "receiptNo": "ACRA251111004200",
    "receiptDate": "2025-11-11"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:05:32.259Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 46035ms |
| Input Tokens | 7120 |
| Output Tokens | 2227 |
| Total Tokens | 9347 |
| Estimated Cost | $0.0116 |

<details>
<summary>Response (2351 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202434295C",
    "name": "DAP ATELIER PRIVATE LIMITED",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-08-21",
    "incorporationDate": "2024-08-21",
    "registrationDate": "2024-08-21"
  },
  "ssicActivities": {
    "primary": {
      "code": "74191",
      "description": "INTERIOR DESIGN SERVICES"
    },
    "secondary": {
      "code": "43301",
      "description": "RENOVATION CONTRACTORS"
    }
  },
  "registeredAddress": {
    "block": "1",
    "streetName": "Thomson Road",
    "level": "04",
    "unit": "348G",
    "buildingName": "Balestier Hill Shopping Centre",
    "postalCode": "300001",
    "effectiveFrom": "2024-08-21"
  },
  "paidUpCapital": {
    "amount": 50000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 50000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 50000,
      "parValue": 1,
      "totalValue": 50000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "TAN MEI JUN, DAPHNE",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8413024I",
      "nationality": "SINGAPORE",
      "address": "27 Lorong Lew Lian #02-05 Cherry Hill Condominium Singapore (536470)",
      "shareClass": "ORDINARY",
      "numberOfShares": 50000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "TAN MEI JUN, DAPHNE",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8413024I",
      "nationality": "SINGAPORE",
      "address": "27 Lorong Lew Lian #02-05 Cherry Hill Condominium Singapore (536470)",
      "appointmentDate": "2024-08-21",
      "cessationDate": null
    },
    {
      "name": "GOH SOON YONG",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S8212885I",
      "nationality": "SINGAPORE",
      "address": "27 Lorong Lew Lian #02-05 Cherry Hill Condominium Singapore (536470)",
      "appointmentDate": "2024-08-21",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "charges": [],
  "documentMetadata": {
    "receiptNo": "ACRA240821088640",
    "receiptDate": "2024-08-21"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:05:11.918Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 91726ms |
| Input Tokens | 7160 |
| Output Tokens | 2533 |
| Total Tokens | 9693 |
| Estimated Cost | $0.0122 |

<details>
<summary>Response (2369 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202511582W",
    "name": "BESPOKE HABITAT B47WA PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-03-17",
    "incorporationDate": "2025-03-17"
  },
  "ssicActivities": {
    "primary": {
      "code": "68103",
      "description": "LETTING OF SELF-OWNED OR LEASED REAL ESTATE PROPERTY EXCEPT FOOD COURTS, COFFEE SHOPS AND CANTEENS (E.G. OFFICE/EXHIBITION SPACE, SHOPPING MALL, SELF-STORAGE FACILITIES)"
    },
    "secondary": {
      "code": "70201",
      "description": "MANAGEMENT CONSULTANCY SERVICES"
    }
  },
  "registeredAddress": {
    "block": "10P",
    "streetName": "BRADDELL HILL",
    "level": "04",
    "unit": "68",
    "buildingName": "BRADDELL VIEW",
    "postalCode": "579733",
    "effectiveFrom": "2025-03-17"
  },
  "paidUpCapital": {
    "amount": 35000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 35000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 35000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "ANG CHEE WEI (HONG ZHIWEI)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8132861G",
      "nationality": "SINGAPORE",
      "address": "10P BRADDELL HILL, #04-68, BRADDELL VIEW, SINGAPORE 579733",
      "shareClass": "ORDINARY",
      "numberOfShares": 35000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "ANG CHEE WEI (HONG ZHIWEI)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8132861G",
      "nationality": "SINGAPORE",
      "address": "10P BRADDELL HILL, #04-68, BRADDELL VIEW, SINGAPORE 579733",
      "appointmentDate": "2025-03-17",
      "cessationDate": null
    },
    {
      "name": "LIEW PIOW LING",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7772412E",
      "nationality": "SINGAPORE",
      "address": "735 UPPER CHANGI ROAD EAST, EAST VIEW GARDEN, SINGAPORE 486863",
      "appointmentDate": "2025-03-17",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-03-17"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:18:46.403Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 41358ms |
| Input Tokens | 7076 |
| Output Tokens | 2373 |
| Total Tokens | 9449 |
| Estimated Cost | $0.0118 |

<details>
<summary>Response (2118 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202518616C",
    "name": "Dawn & Vine Pte. Ltd.",
    "formerName": "",
    "dateOfNameChange": "",
    "formerNames": [],
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-04-29",
    "incorporationDate": "2025-04-29",
    "registrationDate": "2025-04-29"
  },
  "ssicActivities": {
    "primary": {
      "code": "47102",
      "description": "Mini-marts, convenience stores and provision shops"
    },
    "secondary": {
      "code": "47539",
      "description": "Retail sale of electrical household appliances, furniture, lighting equipment and other household articles n.e.c."
    }
  },
  "registeredAddress": {
    "block": "95",
    "streetName": "Prince Charles Crescent",
    "level": "13",
    "unit": "12",
    "buildingName": "Principal Garden",
    "postalCode": "159027",
    "effectiveFrom": "2025-04-29"
  },
  "paidUpCapital": {
    "amount": 0,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 30000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 30000,
      "isPaidUp": false,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Yang Yaci",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9273498F",
      "nationality": "Chinese",
      "placeOfOrigin": "",
      "address": "95 Prince Charles Crescent, #13-12, Principal Garden, Singapore 159027",
      "shareClass": "ORDINARY",
      "numberOfShares": 30000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Yang Yaci",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9273498F",
      "nationality": "Chinese",
      "address": "95 Prince Charles Crescent, #13-12, Principal Garden, Singapore 159027",
      "appointmentDate": "2025-04-29",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-04-29"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:19:14.779Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 33252ms |
| Input Tokens | 7115 |
| Output Tokens | 2244 |
| Total Tokens | 9359 |
| Estimated Cost | $0.0116 |

<details>
<summary>Response (2300 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "201425302C",
    "name": "B.R.I.T. MANAGEMENT CONSULTING PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2014-08-28",
    "incorporationDate": "2014-08-28",
    "registrationDate": "2014-08-28"
  },
  "ssicActivities": {
    "primary": {
      "code": "70201",
      "description": "MANAGEMENT CONSULTANCY SERVICES"
    }
  },
  "registeredAddress": {
    "block": "54",
    "streetName": "Chai Chee Street",
    "level": "14",
    "unit": "861",
    "postalCode": "460054",
    "effectiveFrom": "2021-06-01"
  },
  "paidUpCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 100,
      "totalValue": 100,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Tan Brian Roy",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7409663H",
      "nationality": "Singapore",
      "address": "54 CHAI CHEE STREET, #14-861, SINGAPORE 460054",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Tan Hwa Seng",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S1290845H",
      "nationality": "Singapore",
      "address": "469A BUKIT BATOK WEST AVENUE 9, #15-421, SINGAPORE 651469",
      "appointmentDate": "2018-11-01",
      "cessationDate": null
    },
    {
      "name": "Tan Brian Roy",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7409663H",
      "nationality": "Singapore",
      "address": "54 CHAI CHEE STREET, #14-861, SINGAPORE 460054",
      "appointmentDate": "2014-08-28",
      "cessationDate": null
    }
  ],
  "financialYear": {
    "endDay": 31,
    "endMonth": 12
  },
  "homeCurrency": "SGD",
  "compliance": {
    "lastAgmDate": "2019-06-30",
    "lastArFiledDate": "2025-07-29",
    "fyeAsAtLastAr": "2024-12-31"
  },
  "documentMetadata": {
    "receiptNo": "ACRA251023004413",
    "receiptDate": "2025-10-23"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:19:18.790Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 30292ms |
| Input Tokens | 8153 |
| Output Tokens | 2023 |
| Total Tokens | 10176 |
| Estimated Cost | $0.0122 |

<details>
<summary>Response (2550 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202416790R",
    "name": "ELEVATION ASSET MANAGEMENT PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-04-27",
    "incorporationDate": "2024-04-27"
  },
  "ssicActivities": {
    "primary": {
      "code": "64202",
      "description": "Other Holding Companies"
    },
    "secondary": {
      "code": "70201",
      "description": "Management Consultancy Services"
    }
  },
  "registeredAddress": {
    "block": "240",
    "streetName": "Hougang Street 22",
    "level": "12",
    "unit": "27",
    "postalCode": "530240",
    "effectiveFrom": "2024-10-08"
  },
  "paidUpCapital": {
    "amount": 1000,
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
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "CHIA LIN EN FIONA",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8849725B",
      "nationality": "Singapore",
      "address": "528A Pasir Ris Street 51 #12-663 Costa Ris Singapore (511528)",
      "shareClass": "ORDINARY",
      "numberOfShares": 500,
      "percentageHeld": 50,
      "currency": "SGD"
    },
    {
      "name": "TAN HUAN GUANG AARON",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9148265G",
      "nationality": "Singapore",
      "address": "240 Hougang Street 22 #12-27 Singapore (530240)",
      "shareClass": "ORDINARY",
      "numberOfShares": 500,
      "percentageHeld": 50,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "TAN HUAN GUANG AARON",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9148265G",
      "nationality": "Singapore",
      "address": "240 Hougang Street 22 #12-27 Singapore (530240)",
      "appointmentDate": "2024-04-27",
      "cessationDate": null
    },
    {
      "name": "CHIA LIN EN FIONA",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8849725B",
      "nationality": "Singapore",
      "address": "528A Pasir Ris Street 51 #12-663 Costa Ris Singapore (511528)",
      "appointmentDate": "2024-04-27",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA241027131871",
    "receiptDate": "2024-10-27"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:19:06.456Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 50682ms |
| Input Tokens | 8343 |
| Output Tokens | 3423 |
| Total Tokens | 11766 |
| Estimated Cost | $0.0152 |

<details>
<summary>Response (3872 chars)</summary>

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
      "description": "Development of software for cybersecurity"
    }
  },
  "registeredAddress": {
    "block": "54",
    "streetName": "Chai Chee Street",
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
      "nationality": "Japanese",
      "address": "96 Hakata-cho, Shinmichi-dori, Donguri-sagaru, Higashiyama-ku, Kyoto City, Kyoto 605-0805",
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
      "nationality": "Japanese",
      "address": "96 Hakata-cho, Shinmichi-dori, Donguri-sagaru, Higashiyama-ku, Kyoto City, Kyoto 605-0805",
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
      "nationality": "Singaporean",
      "address": "54 Chai Chee Street, #14-861, Singapore 460054",
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
      "nationality": "Singaporean",
      "address": "54 Chai Chee Street, #14-861, Singapore 460054",
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
      "nationality": "Japanese",
      "address": "96 Hakata-cho, Shinmichi-dori, Donguri-sagaru, Higashiyama-ku, Kyoto City, Kyoto 605-0805",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    },
    {
      "name": "TAN BRIAN ROY",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7409663H",
      "nationality": "Singaporean",
      "address": "54 Chai Chee Street, #14-861, Singapore 460054",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    },
    {
      "name": "TAN HWA SENG",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S1290845H",
      "nationality": "Singaporean",
      "address": "469A Bukit Batok West Avenue 9, #15-421, Singapore 651469",
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

## AI Request - 2026-03-02T15:19:23.408Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 37287ms |
| Input Tokens | 7160 |
| Output Tokens | 2350 |
| Total Tokens | 9510 |
| Estimated Cost | $0.0119 |

<details>
<summary>Response (2540 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202527088G",
    "name": "EPIC LEAP NOW PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-06-23",
    "incorporationDate": "2025-06-23",
    "registrationDate": "2025-06-23"
  },
  "ssicActivities": {
    "primary": {
      "code": "62011",
      "description": "Development of software and applications (except games and cybersecurity)"
    },
    "secondary": {
      "code": "73100",
      "description": "Advertising activities"
    }
  },
  "registeredAddress": {
    "block": "9",
    "streetName": "Leedon Heights",
    "level": "26",
    "unit": "25",
    "buildingName": "D'Leedon",
    "postalCode": "267954",
    "effectiveFrom": "2025-06-23"
  },
  "paidUpCapital": {
    "amount": 0,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 1,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 100,
      "isPaidUp": false,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Ma Jun Yan",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8771052A",
      "nationality": "Singapore",
      "address": "9 Leedon Heights, #26-25, D'Leedon, Singapore 267954",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Ma Jun Yan",
      "role": "CEO",
      "identificationType": "NRIC",
      "identificationNumber": "S8771052A",
      "nationality": "Singapore",
      "address": "9 Leedon Heights, #26-25, D'Leedon, Singapore 267954",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    },
    {
      "name": "Ma Jun Yan",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8771052A",
      "nationality": "Singapore",
      "address": "9 Leedon Heights, #26-25, D'Leedon, Singapore 267954",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    },
    {
      "name": "Ma Jun Yan",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8771052A",
      "nationality": "Singapore",
      "address": "9 Leedon Heights, #26-25, D'Leedon, Singapore 267954",
      "appointmentDate": "2025-06-23",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-06-23"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:29:15.831Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 36557ms |
| Input Tokens | 7081 |
| Output Tokens | 2055 |
| Total Tokens | 9136 |
| Estimated Cost | $0.0112 |

<details>
<summary>Response (2203 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202510716E",
    "name": "GD CARWASH PTE. LTD.",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-03-11",
    "incorporationDate": "2025-03-11",
    "registrationDate": "2025-03-11"
  },
  "ssicActivities": {
    "primary": {
      "code": "95302",
      "description": "Car washing and related services"
    }
  },
  "registeredAddress": {
    "block": "8",
    "streetName": "Makeway Avenue",
    "level": "15",
    "unit": "15",
    "buildingName": "Kopar At Newton",
    "postalCode": "228607",
    "effectiveFrom": "2025-03-11"
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
      "numberOfShares": 100000,
      "parValue": 0.1,
      "totalValue": 10000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Chiang Han Chiang @ Dennis Kong",
      "type": "INDIVIDUAL",
      "identificationType": "FIN",
      "identificationNumber": "S8772352F",
      "nationality": "Taiwanese",
      "address": "8 Makeway Avenue, #15-15, Kopar At Newton, Singapore 228607",
      "shareClass": "ORDINARY",
      "numberOfShares": 100000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Chiang Han Chiang @ Dennis Kong",
      "role": "DIRECTOR",
      "identificationType": "FIN",
      "identificationNumber": "S8772352F",
      "nationality": "Taiwanese",
      "address": "8 Makeway Avenue, #15-15, Kopar At Newton, Singapore 228607",
      "appointmentDate": "2025-03-11",
      "cessationDate": null
    },
    {
      "name": "Tay Lay Kheng",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S6910806G",
      "nationality": "Singapore",
      "address": "644 Yishun Street 61, #05-314, Singapore 760644",
      "appointmentDate": "2025-03-11",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA250902004254",
    "receiptDate": "2025-09-02"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:29:32.248Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 30910ms |
| Input Tokens | 7034 |
| Output Tokens | 1687 |
| Total Tokens | 8721 |
| Estimated Cost | $0.0104 |

<details>
<summary>Response (1850 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202526892N",
    "name": "HEALTHSAFE CONSULTANCY PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-06-20",
    "incorporationDate": "2025-06-20",
    "registrationDate": "2025-06-20"
  },
  "ssicActivities": {
    "primary": {
      "code": "70201",
      "description": "Management Consultancy Services"
    },
    "secondary": {
      "code": "85409",
      "description": "Training Courses N.E.C."
    }
  },
  "registeredAddress": {
    "block": "171",
    "streetName": "Yishun Avenue 7",
    "level": "04",
    "unit": "775",
    "postalCode": "760171",
    "effectiveFrom": "2025-06-20"
  },
  "paidUpCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 100,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Leong Ah Chan",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S0506456B",
      "nationality": "Singapore",
      "address": "171 Yishun Avenue 7, #04-775, Singapore 760171",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Wong Win Hong (Huang Yongkang)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8116271I",
      "nationality": "Singapore",
      "address": "171 Yishun Avenue 7, #04-775, Singapore 760171",
      "appointmentDate": "2025-06-20",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-06-20"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:29:27.065Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 53223ms |
| Input Tokens | 7248 |
| Output Tokens | 3246 |
| Total Tokens | 10494 |
| Estimated Cost | $0.0137 |

<details>
<summary>Response (2955 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "201024398K",
    "name": "GLOBAL DYNAMIC INVESTMENTS PTE. LTD.",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2010-11-16",
    "incorporationDate": "2010-11-16",
    "registrationDate": "2010-11-16"
  },
  "ssicActivities": {
    "primary": {
      "code": "64202",
      "description": "OTHER HOLDING COMPANIES"
    },
    "secondary": {
      "code": "46900",
      "description": "WHOLESALE TRADE OF A VARIETY OF GOODS WITHOUT A DOMINANT PRODUCT"
    }
  },
  "registeredAddress": {
    "block": "112",
    "streetName": "Robinson Road",
    "level": "03",
    "unit": "01",
    "buildingName": "Robinson 112",
    "postalCode": "068902",
    "effectiveFrom": "2020-02-27"
  },
  "paidUpCapital": {
    "amount": 1000,
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
      "parValue": 1,
      "totalValue": 1000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Singapore Horizon International Investment Pte. Ltd.",
      "type": "CORPORATE",
      "identificationType": "UEN",
      "identificationNumber": "201132556R",
      "nationality": "Singapore",
      "placeOfOrigin": "Singapore",
      "address": "112 Robinson Road #03-01 Robinson 112 Singapore 068902",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Yew See Jan",
      "role": "DIRECTOR",
      "identificationType": "FIN",
      "identificationNumber": "S7682784B",
      "nationality": "Malaysia",
      "address": "23 Palm Grove Avenue #02-25 Palm Grove Condominium Singapore 547325",
      "appointmentDate": "2020-10-12",
      "cessationDate": null
    },
    {
      "name": "Hou, Guangzhen",
      "role": "DIRECTOR",
      "identificationType": "FIN",
      "identificationNumber": "E06984766",
      "nationality": "China",
      "address": "No.136 Haibin 5th Road, Bonded Port of Tianjin, Binhai New Area, China",
      "appointmentDate": "2023-11-20",
      "cessationDate": null
    },
    {
      "name": "Zhang Yimeng",
      "role": "SECRETARY",
      "identificationType": "FIN",
      "identificationNumber": "S9087510H",
      "nationality": "China",
      "address": "953A Tampines Street 96 #16-165 Singapore 521953",
      "appointmentDate": "2024-07-15",
      "cessationDate": null
    }
  ],
  "auditor": {
    "name": "Veronica L & Associates"
  },
  "financialYear": {
    "endDay": 31,
    "endMonth": 12
  },
  "homeCurrency": "SGD",
  "compliance": {
    "lastAgmDate": "2023-07-31",
    "lastArFiledDate": "2023-09-09",
    "fyeAsAtLastAr": "2019-12-31"
  },
  "documentMetadata": {
    "receiptNo": "ACRA241025126715",
    "receiptDate": "2024-10-25"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:29:43.698Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 40892ms |
| Input Tokens | 7104 |
| Output Tokens | 2696 |
| Total Tokens | 9800 |
| Estimated Cost | $0.0125 |

<details>
<summary>Response (2024 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202447746H",
    "name": "HOMEHIVE PRIVATE LIMITED",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-11-20",
    "incorporationDate": "2024-11-20",
    "registrationDate": "2024-11-20"
  },
  "ssicActivities": {
    "primary": {
      "code": "47109",
      "description": "RETAIL SALE IN OTHER NON-SPECIALISED STORES N.E.C."
    },
    "secondary": {
      "code": "85406",
      "description": "TRAINING COURSES FOR WHOLESALE TRADE, LOGISTICS AND TRANSPORT"
    }
  },
  "registeredAddress": {
    "block": "68",
    "streetName": "Bayshore Road",
    "level": "07",
    "unit": "01",
    "buildingName": "Costa Del Sol",
    "postalCode": "469986",
    "effectiveFrom": "2024-11-20"
  },
  "paidUpCapital": {
    "amount": 100,
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
      "parValue": null,
      "totalValue": 1000,
      "isPaidUp": false,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Teo Chin Tat",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7011862I",
      "nationality": "Singapore",
      "placeOfOrigin": null,
      "address": "68 Bayshore Road #07-01 Costa Del Sol Singapore 469986",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Teo Chin Tat",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7011862I",
      "nationality": "Singapore",
      "address": "68 Bayshore Road #07-01 Costa Del Sol Singapore 469986",
      "appointmentDate": "2024-11-20",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA241120053978",
    "receiptDate": "2024-11-20"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:29:38.254Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 48677ms |
| Input Tokens | 7145 |
| Output Tokens | 3083 |
| Total Tokens | 10228 |
| Estimated Cost | $0.0133 |

<details>
<summary>Response (2668 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202608765N",
    "name": "HEYHR PTE. LTD.",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2026-02-27",
    "incorporationDate": "2026-02-27",
    "registrationDate": "2026-02-27"
  },
  "ssicActivities": {
    "primary": {
      "code": "62011",
      "description": "DEVELOPMENT OF SOFTWARE AND APPLICATIONS (EXCEPT GAMES AND CYBERSECURITY)"
    },
    "secondary": {
      "code": "78300",
      "description": "MANAGEMENT OF HUMAN RESOURCE FUNCTIONS"
    }
  },
  "registeredAddress": {
    "block": "22",
    "streetName": "Sin Ming Lane",
    "level": "06",
    "unit": "76",
    "buildingName": "Midview City",
    "postalCode": "573969",
    "effectiveFrom": "2026-02-27",
    "fullAddress": "22 Sin Ming Lane, #06-76, Midview City, Singapore 573969"
  },
  "paidUpCapital": {
    "amount": 300000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 300000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 9000000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "KIM SEOK JIN",
      "type": "INDIVIDUAL",
      "identificationType": "OTHER",
      "identificationNumber": "S7555857J",
      "nationality": "South Korean",
      "address": "50 Newton Road, #19-01, Newton Gems, Singapore 307991",
      "shareClass": "ORDINARY",
      "numberOfShares": 9000000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "KIM SEOK JIN",
      "role": "DIRECTOR",
      "identificationType": "OTHER",
      "identificationNumber": "S7555857J",
      "nationality": "South Korean",
      "address": "50 Newton Road, #19-01, Newton Gems, Singapore 307991",
      "appointmentDate": "2026-02-27",
      "cessationDate": null
    },
    {
      "name": "KIM SEOK JIN",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "OTHER",
      "identificationNumber": "S7555857J",
      "nationality": "South Korean",
      "address": "50 Newton Road, #19-01, Newton Gems, Singapore 307991",
      "appointmentDate": "2026-02-27",
      "cessationDate": null
    },
    {
      "name": "TAN WEI JIE",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "Singaporean",
      "address": "631 Choa Chu Kang North 6, #25-72, Singapore 680631",
      "appointmentDate": "2026-02-27",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2026-02-27"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:39:55.416Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 37823ms |
| Input Tokens | 7161 |
| Output Tokens | 2457 |
| Total Tokens | 9618 |
| Estimated Cost | $0.0121 |

<details>
<summary>Response (2478 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202546023R",
    "name": "HUI CHUAN CHANG HONG PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-10-15",
    "incorporationDate": "2025-10-15",
    "registrationDate": "2025-10-15"
  },
  "ssicActivities": {
    "primary": {
      "code": "46412",
      "description": "Wholesale of adults' clothing"
    }
  },
  "registeredAddress": {
    "block": "60",
    "streetName": "Paya Lebar Road",
    "level": "07",
    "unit": "54",
    "buildingName": "Paya Lebar Square",
    "postalCode": "409051",
    "effectiveFrom": "2025-10-15"
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
      "name": "Zhang, Xu",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "EJ9147629",
      "nationality": "Chinese",
      "address": "RMB, 5/F Bonds Mansion Nathan Road, Yaumati KLN",
      "shareClass": "ORDINARY",
      "numberOfShares": 100000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Tan Wei Jie",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "Singapore",
      "address": "21 Bukit Batok Crescent, #25-72, WCEGA Tower, Singapore 658065",
      "appointmentDate": "2025-10-15",
      "cessationDate": null
    },
    {
      "name": "Zhang Yujian",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7769079D",
      "nationality": "Singapore",
      "address": "16 Marine Terrace, #07-62, Marine Terrace Breeze, Singapore 440016",
      "appointmentDate": "2025-10-15",
      "cessationDate": null
    },
    {
      "name": "Zhang, Xu",
      "role": "DIRECTOR",
      "identificationType": "PASSPORT",
      "identificationNumber": "EJ9147629",
      "nationality": "Chinese",
      "address": "RMB, 5/F Bonds Mansion Nathan Road, Yaumati KLN",
      "appointmentDate": "2025-10-15",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-10-15"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:40:02.462Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 41792ms |
| Input Tokens | 5647 |
| Output Tokens | 2532 |
| Total Tokens | 8179 |
| Estimated Cost | $0.0107 |

<details>
<summary>Response (2457 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202523874C",
    "name": "INFINITI.AI HOLDINGS PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-06-01",
    "incorporationDate": "2025-06-01",
    "registrationDate": "2025-06-01"
  },
  "ssicActivities": {
    "primary": {
      "code": "62011",
      "description": "Development of software and applications (except games and cybersecurity)"
    }
  },
  "registeredAddress": {
    "block": "16",
    "streetName": "Fernvale Street",
    "level": "",
    "unit": "#20-21",
    "buildingName": "Parc Botannia",
    "postalCode": "797393",
    "effectiveFrom": "2025-06-16"
  },
  "mailingAddress": {
    "block": "16",
    "streetName": "Fernvale Street",
    "level": "",
    "unit": "#20-21",
    "buildingName": "Parc Botannia",
    "postalCode": "797393",
    "effectiveFrom": "2025-06-16"
  },
  "paidUpCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 100,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 100,
      "parValue": 1,
      "totalValue": 100,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "GOH BAN HOCK ANDREW",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S1295454I",
      "nationality": "Singapore",
      "address": "16 FERNVALE STREET, #20-21 PARC BOTANNIA, SINGAPORE 797393",
      "shareClass": "ORDINARY",
      "numberOfShares": 60,
      "percentageHeld": 60,
      "currency": "SGD"
    },
    {
      "name": "PHILIPPOT MAXIME",
      "type": "INDIVIDUAL",
      "identificationType": "FIN",
      "identificationNumber": "G3204504P",
      "nationality": "French",
      "address": "16 FERNVALE STREET, #20-21 PARC BOTANNIA, SINGAPORE 797393",
      "shareClass": "ORDINARY",
      "numberOfShares": 40,
      "percentageHeld": 40,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "GOH BAN HOCK ANDREW",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S1295454I",
      "nationality": "Singapore",
      "address": "16 FERNVALE STREET, #20-21 PARC BOTANNIA, SINGAPORE 797393",
      "appointmentDate": "2025-06-01",
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

## AI Request - 2026-03-02T15:39:58.698Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 50165ms |
| Input Tokens | 9450 |
| Output Tokens | 3313 |
| Total Tokens | 12763 |
| Estimated Cost | $0.0161 |

<details>
<summary>Response (4625 chars)</summary>

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
    "streetName": "Woodlands Square",
    "level": "12",
    "unit": "85",
    "buildingName": "Woods Square",
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
      "parValue": 1,
      "totalValue": 1000,
      "isPaidUp": false,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Nicholas Raymond Thomas Young",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "PA9551504",
      "nationality": "Australian",
      "address": "Unit 3, 165 Heatherdale Road, Vermont, VIC 3133, Australia",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 10,
      "currency": "SGD"
    },
    {
      "name": "Kim Michelle Young",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "PB4188632",
      "nationality": "Australian",
      "address": "Unit 3, 165 Heatherdale Road, Vermont, VIC 3133, Australia",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 10,
      "currency": "SGD"
    },
    {
      "name": "Marcus Raymond Thomas Young",
      "type": "INDIVIDUAL",
      "identificationType": "PASSPORT",
      "identificationNumber": "PB5305307",
      "nationality": "Australian",
      "address": "Unit 3, 165 Heatherdale Road, Vermont, VIC 3133, Australia",
      "shareClass": "ORDINARY",
      "numberOfShares": 100,
      "percentageHeld": 10,
      "currency": "SGD"
    },
    {
      "name": "Quintessa Holdings Pty Ltd",
      "type": "CORPORATE",
      "identificationType": "OTHER",
      "identificationNumber": "T24UF6036K",
      "placeOfOrigin": "Australia",
      "address": "Suite 2, 142 Canterbury Road, Heathmont, VIC 3135, Australia",
      "shareClass": "ORDINARY",
      "numberOfShares": 700,
      "percentageHeld": 70,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Marcus Raymond Thomas Young",
      "role": "DIRECTOR",
      "identificationType": "PASSPORT",
      "identificationNumber": "PB5305307",
      "nationality": "Australian",
      "address": "Unit 3, 165 Heatherdale Road, Vermont, VIC 3133, Australia",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    },
    {
      "name": "Goh Sin Wei",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7926831C",
      "nationality": "Singapore",
      "address": "21 Sembawang Crescent #03-03 Parc Life, Singapore 757053",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    },
    {
      "name": "Goh Sin Wei",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7926831C",
      "nationality": "Singapore",
      "address": "21 Sembawang Crescent #03-03 Parc Life, Singapore 757053",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    },
    {
      "name": "Nicholas Raymond Thomas Young",
      "role": "CHIEF_EXECUTIVE_OFFICER",
      "identificationType": "PASSPORT",
      "identificationNumber": "PA9551504",
      "nationality": "Australian",
      "address": "Unit 3, 165 Heatherdale Road, Vermont, VIC 3133, Australia",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    },
    {
      "name": "Nicholas Raymond Thomas Young",
      "role": "DIRECTOR",
      "identificationType": "PASSPORT",
      "identificationNumber": "PA9551504",
      "nationality": "Australian",
      "address": "Unit 3, 165 Heatherdale Road, Vermont, VIC 3133, Australia",
      "appointmentDate": "2024-06-26",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "charges": [],
  "documentMetadata": {
    "receiptNo": "ACRA240626120546",
    "receiptDate": "2024-06-26"
  }
}
```
</details>

---

## AI Request - 2026-03-02T15:40:08.456Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
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
| Latency | 44404ms |
| Input Tokens | 7128 |
| Output Tokens | 2538 |
| Total Tokens | 9666 |
| Estimated Cost | $0.0122 |

<details>
<summary>Response (2116 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202449207H",
    "name": "AFFINITYWORKS PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-12-01",
    "incorporationDate": "2024-12-01",
    "registrationDate": "2024-12-01"
  },
  "ssicActivities": {
    "primary": {
      "code": "78300",
      "description": "Management of human resource functions"
    }
  },
  "registeredAddress": {
    "block": "135",
    "streetName": "Middle Road",
    "level": "02",
    "unit": "27",
    "buildingName": "Bylands Building",
    "postalCode": "188975",
    "effectiveFrom": "2024-12-01"
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
      "numberOfShares": 5000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "Teo Hwi Woon",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8426458Z",
      "nationality": "Singapore",
      "address": "25C Surin Avenue, Charlton 27, Singapore 533968",
      "shareClass": "ORDINARY",
      "numberOfShares": 5000,
      "percentageHeld": 100,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "Teo Hwi Woon",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8426458Z",
      "nationality": "Singapore",
      "address": "25C Surin Avenue, Charlton 27, Singapore 533968",
      "appointmentDate": "2024-12-01",
      "cessationDate": null
    },
    {
      "name": "Loh Zhi Xiang",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S8848369C",
      "nationality": "Singapore",
      "address": "135 Middle Road, #02-27 Bylands Building, Singapore 188975",
      "appointmentDate": "2024-12-01",
      "cessationDate": null
    }
  ],
  "homeCurrency": "SGD",
  "documentMetadata": {
    "receiptNo": "ACRA241201007117",
    "receiptDate": "2024-12-01"
  }
}
```
</details>

---

