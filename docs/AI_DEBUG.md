# AI Debug Log

This file contains debug logs for AI extraction calls when `AI_DEBUG=true`.

---

## AI Request - 2026-01-17T05:33:45.611Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gemini-3 |
| Provider | google |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 29152ms |
| Input Tokens | 4309 |
| Output Tokens | 1020 |
| Total Tokens | 7528 |
| Estimated Cost | $0.0063 |

<details>
<summary>Response (2608 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202437906H",
    "name": "OAKTREE ACCOUNTING & CORPORATE SOLUTIONS PTE. LTD.",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-09-14",
    "incorporationDate": "2024-09-14"
  },
  "ssicActivities": {
    "primary": {
      "code": "64999",
      "description": "OTHER FINANCIAL SERVICE ACTIVITIES, EXCEPT INSURANCE AND PENSION FUNDING ACTIVITIES N.E.C."
    },
    "secondary": {
      "code": "69202",
      "description": "BOOK-KEEPING SERVICES (EXCLUDING ONLINE MARKETPLACES)"
    }
  },
  "registeredAddress": {
    "block": "21",
    "streetName": "BUKIT BATOK CRESCENT",
    "level": "25",
    "unit": "72",
    "buildingName": "WCEGA TOWER",
    "postalCode": "658065",
    "effectiveFrom": "2025-06-01"
  },
  "paidUpCapital": {
    "amount": 2000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 2000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SINGAPORE DOLLAR",
      "numberOfShares": 2000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "KOH ZHI YONG",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9015929A",
      "nationality": "SINGAPORE CITIZEN",
      "address": "465A CLEMENTI AVENUE 1, #33-68, SINGAPORE 121465",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "currency": "SINGAPORE DOLLAR"
    },
    {
      "name": "TAN WEI JIE",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "SINGAPORE CITIZEN",
      "address": "2 WOODLANDS SECTOR 1, #03-02, WOODLANDS SPECTRUM, SINGAPORE 738068",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "currency": "SINGAPORE DOLLAR"
    }
  ],
  "officers": [
    {
      "name": "KOH ZHI YONG",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9015929A",
      "nationality": "SINGAPORE CITIZEN",
      "address": "465A CLEMENTI AVENUE 1, #33-68, SINGAPORE 121465",
      "appointmentDate": "2024-09-14"
    },
    {
      "name": "TAN WEI JIE",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "SINGAPORE CITIZEN",
      "address": "2 WOODLANDS SECTOR 1, #03-02, WOODLANDS SPECTRUM, SINGAPORE 738068",
      "appointmentDate": "2024-09-14"
    }
  ],
  "documentMetadata": {
    "receiptNo": "ACRA250608000899",
    "receiptDate": "2025-06-08"
  }
}
```
</details>

---

## AI Request - 2026-01-17T05:45:53.790Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gemini-3 |
| Provider | google |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 32518ms |
| Input Tokens | 4309 |
| Output Tokens | 1088 |
| Total Tokens | 7888 |
| Estimated Cost | $0.0065 |

<details>
<summary>Response (2801 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202437906H",
    "name": "OAKTREE ACCOUNTING & CORPORATE SOLUTIONS PTE. LTD.",
    "formerName": null,
    "dateOfNameChange": null,
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-09-14",
    "incorporationDate": "2024-09-14"
  },
  "ssicActivities": {
    "primary": {
      "code": "64999",
      "description": "OTHER FINANCIAL SERVICE ACTIVITIES, EXCEPT INSURANCE AND PENSION FUNDING ACTIVITIES N.E.C."
    },
    "secondary": {
      "code": "69202",
      "description": "BOOK-KEEPING SERVICES (EXCLUDING ONLINE MARKETPLACES)"
    }
  },
  "registeredAddress": {
    "block": "21",
    "streetName": "BUKIT BATOK CRESCENT",
    "level": "25",
    "unit": "72",
    "buildingName": "WCEGA TOWER",
    "postalCode": "658065",
    "effectiveFrom": "2025-06-01"
  },
  "paidUpCapital": {
    "amount": 2000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 2000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 2000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "KOH ZHI YONG",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9015929A",
      "nationality": "SINGAPORE CITIZEN",
      "address": "465A CLEMENTI AVENUE 1, #33-68, SINGAPORE 121465",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "currency": "SGD"
    },
    {
      "name": "TAN WEI JIE",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "SINGAPORE CITIZEN",
      "address": "2 WOODLANDS SECTOR 1, #03-02, WOODLANDS SPECTRUM, SINGAPORE 738068",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "KOH ZHI YONG",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9015929A",
      "nationality": "SINGAPORE CITIZEN",
      "address": "465A CLEMENTI AVENUE 1, #33-68, SINGAPORE 121465",
      "appointmentDate": "2024-09-14",
      "cessationDate": null
    },
    {
      "name": "TAN WEI JIE",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "SINGAPORE CITIZEN",
      "address": "2 WOODLANDS SECTOR 1, #03-02, WOODLANDS SPECTRUM, SINGAPORE 738068",
      "appointmentDate": "2024-09-14",
      "cessationDate": null
    }
  ],
  "compliance": {
    "lastAgmDate": null,
    "lastArFiledDate": null,
    "fyeAsAtLastAr": null
  },
  "charges": [],
  "documentMetadata": {
    "receiptNo": "ACRA250608000899",
    "receiptDate": "2025-06-08"
  }
}
```
</details>

---

## AI Request - 2026-01-17T05:55:51.786Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gemini-3 |
| Provider | google |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 26743ms |
| Input Tokens | 4309 |
| Output Tokens | 1100 |
| Total Tokens | 7224 |
| Estimated Cost | $0.0065 |

<details>
<summary>Response (2840 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202437906H",
    "name": "OAKTREE ACCOUNTING & CORPORATE SOLUTIONS PTE. LTD.",
    "formerName": null,
    "dateOfNameChange": null,
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-09-14",
    "incorporationDate": "2024-09-14"
  },
  "ssicActivities": {
    "primary": {
      "code": "64999",
      "description": "OTHER FINANCIAL SERVICE ACTIVITIES, EXCEPT INSURANCE AND PENSION FUNDING ACTIVITIES N.E.C."
    },
    "secondary": {
      "code": "69202",
      "description": "BOOK-KEEPING SERVICES (EXCLUDING ONLINE MARKETPLACES)"
    }
  },
  "registeredAddress": {
    "block": "21",
    "streetName": "BUKIT BATOK CRESCENT",
    "level": "25",
    "unit": "72",
    "buildingName": "WCEGA TOWER",
    "postalCode": "658065",
    "effectiveFrom": "2025-06-01"
  },
  "paidUpCapital": {
    "amount": 2000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 2000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SINGAPORE DOLLAR",
      "numberOfShares": 2000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "KOH ZHI YONG",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9015929A",
      "nationality": "SINGAPORE CITIZEN",
      "address": "465A CLEMENTI AVENUE 1, #33-68, SINGAPORE 121465",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "currency": "SINGAPORE DOLLAR"
    },
    {
      "name": "TAN WEI JIE",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "SINGAPORE CITIZEN",
      "address": "2 WOODLANDS SECTOR 1, #03-02, WOODLANDS SPECTRUM, SINGAPORE 738068",
      "shareClass": "ORDINARY",
      "numberOfShares": 1000,
      "currency": "SINGAPORE DOLLAR"
    }
  ],
  "officers": [
    {
      "name": "KOH ZHI YONG",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9015929A",
      "nationality": "SINGAPORE CITIZEN",
      "address": "465A CLEMENTI AVENUE 1, #33-68, SINGAPORE 121465",
      "appointmentDate": "2024-09-14",
      "cessationDate": null
    },
    {
      "name": "TAN WEI JIE",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9101817I",
      "nationality": "SINGAPORE CITIZEN",
      "address": "2 WOODLANDS SECTOR 1, #03-02, WOODLANDS SPECTRUM, SINGAPORE 738068",
      "appointmentDate": "2024-09-14",
      "cessationDate": null
    }
  ],
  "compliance": {
    "lastAgmDate": null,
    "lastArFiledDate": null,
    "fyeAsAtLastAr": null
  },
  "charges": [],
  "documentMetadata": {
    "receiptNo": "ACRA250608000899",
    "receiptDate": "2025-06-08"
  }
}
```
</details>

---

## AI Request - 2026-01-17T06:01:25.689Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gemini-3 |
| Provider | google |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 24582ms |
| Input Tokens | 4309 |
| Output Tokens | 817 |
| Total Tokens | 6838 |
| Estimated Cost | $0.0059 |

<details>
<summary>Response (2013 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202510716E",
    "name": "GD CARWASH PTE. LTD.",
    "incorporationDate": "2025-03-11",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-03-11"
  },
  "ssicActivities": {
    "primary": {
      "code": "95302",
      "description": "CAR WASHING AND RELATED SERVICES"
    }
  },
  "registeredAddress": {
    "block": "8",
    "streetName": "MAKEWAY AVENUE",
    "level": "15",
    "unit": "15",
    "buildingName": "KOPAR AT NEWTON",
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
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "CHIANG HAN CHIANG @ DENNIS KONG",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8772352F",
      "nationality": "TAIWANESE",
      "address": "8 MAKEWAY AVENUE, #15-15, KOPAR AT NEWTON, SINGAPORE 228607",
      "shareClass": "ORDINARY",
      "numberOfShares": 100000,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "CHIANG HAN CHIANG @ DENNIS KONG",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8772352F",
      "nationality": "TAIWANESE",
      "address": "8 MAKEWAY AVENUE, #15-15, KOPAR AT NEWTON, SINGAPORE 228607",
      "appointmentDate": "2025-03-11"
    },
    {
      "name": "TAY LAY KHENG",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S6910806G",
      "nationality": "SINGAPORE CITIZEN",
      "address": "644 YISHUN STREET 61, #05-314, SINGAPORE 760644",
      "appointmentDate": "2025-03-11"
    }
  ],
  "documentMetadata": {
    "receiptNo": "ACRA250902004254",
    "receiptDate": "2025-09-02"
  }
}
```
</details>

---

## AI Request - 2026-01-17T06:06:01.430Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gemini-3 |
| Provider | google |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 28292ms |
| Input Tokens | 4309 |
| Output Tokens | 1134 |
| Total Tokens | 7266 |
| Estimated Cost | $0.0066 |

<details>
<summary>Response (2807 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202515951M",
    "name": "WHAT THE MATH! PTE. LTD.",
    "formerName": null,
    "dateOfNameChange": null,
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-04-13",
    "incorporationDate": "2025-04-13"
  },
  "ssicActivities": {
    "primary": {
      "code": "85409",
      "description": "TRAINING COURSES N.E.C."
    }
  },
  "registeredAddress": {
    "block": "669",
    "streetName": "CHOA CHU KANG CRESCENT",
    "level": "09",
    "unit": "355",
    "postalCode": "680669",
    "effectiveFrom": "2025-04-13"
  },
  "paidUpCapital": {
    "amount": 80000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 80000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 2,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "HO GUO SHENG",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8711159H",
      "nationality": "SINGAPORE CITIZEN",
      "address": "669 CHOA CHU KANG CRESCENT, #09-355, SINGAPORE 680669",
      "shareClass": "ORDINARY",
      "numberOfShares": 1,
      "currency": "SGD"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "shareClass": "ORDINARY",
      "numberOfShares": 1,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "HO GUO SHENG",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8711159H",
      "nationality": "SINGAPORE CITIZEN",
      "address": "669 CHOA CHU KANG CRESCENT, #09-355, SINGAPORE 680669",
      "appointmentDate": "2025-04-13"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "appointmentDate": "2025-04-13"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "appointmentDate": "2025-04-13"
    }
  ],
  "compliance": {
    "lastAgmDate": null,
    "lastArFiledDate": null,
    "fyeAsAtLastAr": null
  },
  "documentMetadata": {
    "receiptNo": "FREE_COPY",
    "receiptDate": "2025-04-13"
  }
}
```
</details>

---

## AI Request - 2026-01-17T06:09:48.876Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gemini-3 |
| Provider | google |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 40160ms |
| Input Tokens | 4309 |
| Output Tokens | 1081 |
| Total Tokens | 8788 |
| Estimated Cost | $0.0065 |

<details>
<summary>Response (2657 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202515951M",
    "name": "WHAT THE MATH! PTE. LTD.",
    "incorporationDate": "2025-04-13",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-04-13"
  },
  "ssicActivities": {
    "primary": {
      "code": "85409",
      "description": "TRAINING COURSES N.E.C."
    }
  },
  "registeredAddress": {
    "block": "669",
    "streetName": "CHOA CHU KANG CRESCENT",
    "unit": "#09-355",
    "postalCode": "680669",
    "effectiveFrom": "2025-04-13"
  },
  "paidUpCapital": {
    "amount": 80000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 80000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 2,
      "totalValue": 80000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "HO GUO SHENG",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8711159H",
      "nationality": "SINGAPORE CITIZEN",
      "address": "669 CHOA CHU KANG CRESCENT, #09-355, SINGAPORE 680669",
      "shareClass": "ORDINARY",
      "numberOfShares": 1,
      "currency": "SGD"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "shareClass": "ORDINARY",
      "numberOfShares": 1,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "HO GUO SHENG",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8711159H",
      "nationality": "SINGAPORE CITIZEN",
      "address": "669 CHOA CHU KANG CRESCENT, #09-355, SINGAPORE 680669",
      "appointmentDate": "2025-04-13"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "appointmentDate": "2025-04-13"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "appointmentDate": "2025-04-13"
    }
  ],
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-04-13"
  }
}
```
</details>

---

## AI Request - 2026-01-17T06:12:27.885Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | bizfile_extraction |
| Model | gemini-3 |
| Provider | google |
| Tenant | 34d9ef41-361e-4159-8746-e6528c4f6a2c |
| Temperature | 0.1 |
| JSON Mode | true |
| Images | 1 |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 39919ms |
| Input Tokens | 4309 |
| Output Tokens | 1081 |
| Total Tokens | 8577 |
| Estimated Cost | $0.0065 |

<details>
<summary>Response (2668 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202515951M",
    "name": "WHAT THE MATH! PTE. LTD.",
    "incorporationDate": "2025-04-13",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-04-13"
  },
  "ssicActivities": {
    "primary": {
      "code": "85409",
      "description": "TRAINING COURSES N.E.C."
    }
  },
  "registeredAddress": {
    "block": "669",
    "streetName": "CHOA CHU KANG CRESCENT",
    "unit": "#09-355",
    "postalCode": "680669",
    "effectiveFrom": "2025-04-13"
  },
  "paidUpCapital": {
    "amount": 80000,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": 80000,
    "currency": "SGD"
  },
  "shareCapital": [
    {
      "shareClass": "ORDINARY",
      "currency": "SGD",
      "numberOfShares": 2,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "HO GUO SHENG",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8711159H",
      "nationality": "SINGAPORE CITIZEN",
      "address": "669 CHOA CHU KANG CRESCENT, #09-355, SINGAPORE 680669",
      "shareClass": "ORDINARY",
      "numberOfShares": 1,
      "currency": "SGD"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "shareClass": "ORDINARY",
      "numberOfShares": 1,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "HO GUO SHENG",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8711159H",
      "nationality": "SINGAPORE CITIZEN",
      "address": "669 CHOA CHU KANG CRESCENT, #09-355, SINGAPORE 680669",
      "appointmentDate": "2025-04-13"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "appointmentDate": "2025-04-13"
    },
    {
      "name": "HO ZHI HUI (HE ZHIHUI)",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8436685D",
      "nationality": "SINGAPORE CITIZEN",
      "address": "10A BENDEMEER ROAD, #18-107, BENDEMEER LIGHT, SINGAPORE 331010",
      "appointmentDate": "2025-04-13"
    }
  ],
  "homeCurrency": "SINGAPORE DOLLAR",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-04-13"
  }
}
```
</details>

---

