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

## AI Request - 2026-01-22T13:04:57.003Z

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
| Latency | 54343ms |
| Input Tokens | 4309 |
| Output Tokens | 992 |
| Total Tokens | 7957 |
| Estimated Cost | $0.0063 |

<details>
<summary>Response (2527 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202519163R",
    "name": "AI 4 SOLUTIONS PTE. LTD.",
    "incorporationDate": "2025-05-02",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-05-02"
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
      "address": "26 KUMBA STREET FLETCHER NSW 2287 AUSTRALIA",
      "shareClass": "ORDINARY",
      "numberOfShares": 150000,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "CEO",
      "identificationType": "FIN",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02"
    },
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "DIRECTOR",
      "identificationType": "FIN",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02"
    },
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "FIN",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02"
    }
  ],
  "documentMetadata": {
    "receiptNo": "ACRA250807001467",
    "receiptDate": "2025-08-07"
  }
}
```
</details>

---

## AI Request - 2026-02-03T04:15:12.210Z

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
| Latency | 25953ms |
| Input Tokens | 4309 |
| Output Tokens | 838 |
| Total Tokens | 6967 |
| Estimated Cost | $0.0060 |

<details>
<summary>Response (2071 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202510716E",
    "name": "GD CARWASH PTE. LTD.",
    "entityType": "PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-03-11",
    "incorporationDate": "2025-03-11"
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
    "unit": "#15-15",
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
      "currency": "SINGAPORE DOLLAR",
      "numberOfShares": 100000,
      "totalValue": 10000,
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
      "currency": "SINGAPORE DOLLAR"
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
  "compliance": {},
  "documentMetadata": {
    "receiptNo": "ACRA250902004254",
    "receiptDate": "2025-09-02"
  }
}
```
</details>

---

## AI Request - 2026-02-03T05:04:31.251Z

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
| Latency | 23940ms |
| Input Tokens | 4309 |
| Output Tokens | 810 |
| Total Tokens | 6846 |
| Estimated Cost | $0.0059 |

<details>
<summary>Response (1996 chars)</summary>

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
    "unit": "#15-15",
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
      "currency": "SINGAPORE DOLLAR",
      "numberOfShares": 100000,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "CHIANG HAN CHIANG @ DENNIS KONG",
      "identificationType": "NRIC",
      "identificationNumber": "S8772352F",
      "nationality": "TAIWANESE",
      "address": "8 MAKEWAY AVENUE, #15-15, KOPAR AT NEWTON, SINGAPORE 228607",
      "shareClass": "ORDINARY",
      "numberOfShares": 100000,
      "currency": "SINGAPORE DOLLAR"
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

## AI Request - 2026-02-03T05:34:16.052Z

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
| Latency | 44320ms |
| Input Tokens | 4309 |
| Output Tokens | 995 |
| Total Tokens | 9031 |
| Estimated Cost | $0.0063 |

<details>
<summary>Response (2530 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202519163R",
    "name": "AI 4 SOLUTIONS PTE. LTD.",
    "incorporationDate": "2025-05-02",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-05-02"
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
      "address": "26 KUMBA STREET FLETCHER NSW 2287 AUSTRALIA",
      "shareClass": "ORDINARY",
      "numberOfShares": 150000,
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
      "appointmentDate": "2025-05-02"
    },
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02"
    },
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02"
    }
  ],
  "documentMetadata": {
    "receiptNo": "ACRA250807001467",
    "receiptDate": "2025-08-07"
  }
}
```
</details>

---

## AI Request - 2026-02-03T06:13:39.572Z

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
| Latency | 44092ms |
| Input Tokens | 4309 |
| Output Tokens | 1017 |
| Total Tokens | 8687 |
| Estimated Cost | $0.0063 |

<details>
<summary>Response (2584 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202519163R",
    "name": "AI 4 SOLUTIONS PTE. LTD.",
    "incorporationDate": "2025-05-02",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-05-02"
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
      "totalValue": 1,
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "treasuryShares": {
    "numberOfShares": 0
  },
  "shareholders": [
    {
      "name": "AI FOR SOLUTIONS PTY LTD",
      "type": "CORPORATE",
      "identificationType": "OTHER",
      "identificationNumber": "AU-689580630",
      "placeOfOrigin": "AUSTRALIA",
      "address": "26 KUMBA STREET FLETCHER NSW 2287 AUSTRALIA",
      "shareClass": "ORDINARY",
      "numberOfShares": 150000,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "CEO",
      "identificationType": "FIN",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02"
    },
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "DIRECTOR",
      "identificationType": "FIN",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02"
    },
    {
      "name": "MOHAMED SADAGATTOULLA SALIHA THASLIM",
      "role": "MANAGING_DIRECTOR",
      "identificationType": "FIN",
      "identificationNumber": "S9682647H",
      "nationality": "INDIAN",
      "address": "520 BEDOK NORTH AVENUE 1, #05-342, SINGAPORE 460520",
      "appointmentDate": "2025-05-02"
    }
  ],
  "charges": [],
  "documentMetadata": {
    "receiptNo": "ACRA250807001467",
    "receiptDate": "2025-08-07"
  }
}
```
</details>

---

## AI Request - 2026-02-03T06:19:42.583Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 67755ms |
| Input Tokens | 6988 |
| Output Tokens | 1838 |
| Total Tokens | 14196 |
| Estimated Cost | $0.0107 |

<details>
<summary>Response (4829 chars)</summary>

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
    "value": "Auto Maxima Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD Car Wash Pte Ltd",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "CS2602004",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-02-02",
    "confidence": 0.98
  },
  "dueDate": {
    "value": "2026-02-02",
    "confidence": 0.6
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "924.92",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "83.24",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "1008.16",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "200506358H",
    "confidence": 0.99
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "IGL Ecocoat Kenzo Graphene coating Kit 40ml",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "181.98",
        "confidence": 0.95
      },
      "amount": {
        "value": "181.98",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "16.38",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.8
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "IGL Kenzo Master Installer Certification",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "348.62",
        "confidence": 0.95
      },
      "amount": {
        "value": "348.62",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "31.38",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7400",
        "confidence": 0.85
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Bodyguard Anti Bacteria Spray- Urban Bay",
        "confidence": 0.99
      },
      "quantity": {
        "value": "12",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "23.85",
        "confidence": 0.95
      },
      "amount": {
        "value": "286.24",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "25.76",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.8
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "Bodyguard Tyre Shine Pro 20 Liter",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "74.08",
        "confidence": 0.95
      },
      "amount": {
        "value": "74.08",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "6.67",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.8
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "Bodyguard Microfiber Coating Applicator 12 pc pkt",
        "confidence": 0.99
      },
      "quantity": {
        "value": "2",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "16.995",
        "confidence": 0.95
      },
      "amount": {
        "value": "33.99",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "3.06",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.8
      }
    },
    {
      "lineNo": 6,
      "description": {
        "value": "Bodyguard Buffel Edgeless M/F Towel 380gsm 40x40cm Black",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "0.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "0.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.9
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-02-03T06:20:50.351Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | Auto Maxima Pte. Ltd. | 0.99 |
| Total Amount | 1008.16 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 5210 | 0.80 | IGL Ecocoat Kenzo Graphene coating Kit 40ml |
| 2 | 7400 | 0.85 | IGL Kenzo Master Installer Certification |
| 3 | 5210 | 0.80 | Bodyguard Anti Bacteria Spray- Urban Bay |
| 4 | 5210 | 0.80 | Bodyguard Tyre Shine Pro 20 Liter |
| 5 | 5210 | 0.80 | Bodyguard Microfiber Coating Applicator 12 pc pkt |
| 6 | 5210 | 0.80 | Bodyguard Buffel Edgeless M/F Towel 380gsm 40x4... |

---

## AI Request - 2026-02-05T03:18:43.652Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 28915ms |
| Input Tokens | 6968 |
| Output Tokens | 874 |
| Total Tokens | 9897 |
| Estimated Cost | $0.0087 |

<details>
<summary>Response (2128 chars)</summary>

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
    "value": "Phoenix Commercial Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD CARWASH PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "1800000026/26",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-01",
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
        "value": "License Fee for GD CARWASH PTE. LTD. Year 1 (01-Jan-2026 to 31-Jan-2026)",
        "confidence": 0.99
      },
      "quantity": null,
      "unitPrice": null,
      "amount": {
        "value": "4800.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "432.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.85
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "License Fee for GD CARWASH PTE. LTD. Carpark Lot (01-Jan-2026 to 31-Jan-2026)",
        "confidence": 0.99
      },
      "quantity": null,
      "unitPrice": null,
      "amount": {
        "value": "260.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "23.40",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6700",
        "confidence": 0.85
      }
    }
  ],
  "overallConfidence": 0.99
}
```
</details>

---

## Extraction Results - 2026-02-05T03:19:12.580Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | Phoenix Commercial Pte. Ltd. | 0.99 |
| Total Amount | 5515.40 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6700 | 0.85 | License Fee for GD CARWASH PTE. LTD. Year 1 (01... |
| 2 | 6700 | 0.85 | License Fee for GD CARWASH PTE. LTD. Carpark Lo... |

---

## AI Request - 2026-02-05T03:18:44.413Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 33545ms |
| Input Tokens | 6960 |
| Output Tokens | 1135 |
| Total Tokens | 10289 |
| Estimated Cost | $0.0092 |

<details>
<summary>Response (2924 chars)</summary>

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
    "value": "Oaktree Accounting & Corporate Solutions Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD Cashwash Pte. Ltd.",
    "confidence": 0.98
  },
  "documentNumber": {
    "value": "INV-1000000246",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-13",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-27",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "800.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "800.00",
    "confidence": 0.99
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "ACC-MTH, Monthly account services Period: Dec 2025",
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
        "confidence": 0.9
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "PAY-MTH, Monthly payroll services Period: Dec 2025",
        "confidence": 0.99
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
        "confidence": 0.95
      },
      "accountCode": {
        "value": "6610",
        "confidence": 0.85
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "PAY-WPA, Work Permit Application - Devan Harmugan",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1.00",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "320.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "320.00",
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
        "value": "6640",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.99
}
```
</details>

---

## Extraction Results - 2026-02-05T03:19:17.966Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | Oaktree Accounting & Corporate Solutions Pte. Ltd. | 0.99 |
| Total Amount | 800.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6610 | 0.90 | ACC-MTH, Monthly account services Period: Dec 2025 |
| 2 | 6610 | 0.85 | PAY-MTH, Monthly payroll services Period: Dec 2025 |
| 3 | 6640 | 0.80 | PAY-WPA, Work Permit Application - Devan Harmugan |

---

## AI Request - 2026-02-05T03:18:45.863Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 32218ms |
| Input Tokens | 6994 |
| Output Tokens | 641 |
| Total Tokens | 9829 |
| Estimated Cost | $0.0083 |

<details>
<summary>Response (1596 chars)</summary>

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
    "value": "Ministry of Manpower",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD CARWASH PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": null,
    "confidence": 0
  },
  "documentDate": {
    "value": "2026-01-06",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-19",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "138.18",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "138.18",
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
        "value": "Foreign Worker Levy for Dec 2025",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.8
      },
      "unitPrice": {
        "value": "138.18",
        "confidence": 0.99
      },
      "amount": {
        "value": "138.18",
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
        "value": "7320",
        "confidence": 0.95
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-02-05T03:19:18.101Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.95 |
| Vendor | Ministry of Manpower | 0.99 |
| Total Amount | 138.18 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7320 | 0.95 | Foreign Worker Levy for Dec 2025 |

---

## AI Request - 2026-02-05T03:18:45.129Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 36911ms |
| Input Tokens | 6957 |
| Output Tokens | 896 |
| Total Tokens | 10697 |
| Estimated Cost | $0.0087 |

<details>
<summary>Response (2245 chars)</summary>

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
    "value": "Auto Maxima Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD Car Wash Pte Ltd",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "CS2601051",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-12",
    "confidence": 0.98
  },
  "dueDate": {
    "value": "2026-01-12",
    "confidence": 0.95
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "278.17",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "25.03",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "303.20",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "200506358H",
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
        "value": "53.67",
        "confidence": 0.95
      },
      "amount": {
        "value": "107.34",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "9.66",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "IGL Ecoshine Leather 5 liter",
        "confidence": 0.99
      },
      "quantity": {
        "value": "2",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "85.41",
        "confidence": 0.95
      },
      "amount": {
        "value": "170.83",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "15.37",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "5210",
        "confidence": 0.9
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-02-05T03:19:22.048Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | Auto Maxima Pte. Ltd. | 0.99 |
| Total Amount | 303.20 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 5210 | 0.90 | Bodyguard FeX Iron Remover 5 Liter |
| 2 | 5210 | 0.90 | IGL Ecoshine Leather 5 liter |

---

## AI Request - 2026-02-05T03:19:52.000Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 27549ms |
| Input Tokens | 6980 |
| Output Tokens | 673 |
| Total Tokens | 9521 |
| Estimated Cost | $0.0083 |

<details>
<summary>Response (1612 chars)</summary>

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
    "value": "StarHub Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD CARWASH PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "8004509262012026",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-04",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-01-18",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "20.18",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "1.82",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "22.00",
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
        "value": "Current Charges Due on 18/01/26",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.8
      },
      "unitPrice": {
        "value": "20.18",
        "confidence": 0.95
      },
      "amount": {
        "value": "20.18",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "1.82",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6900",
        "confidence": 0.9
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-02-05T03:20:19.556Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | StarHub Ltd | 0.99 |
| Total Amount | 22.00 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6900 | 0.90 | Current Charges Due on 18/01/26 |

---

## AI Request - 2026-02-05T03:19:53.366Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 26307ms |
| Input Tokens | 6968 |
| Output Tokens | 667 |
| Total Tokens | 9430 |
| Estimated Cost | $0.0083 |

<details>
<summary>Response (1602 chars)</summary>

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
    "value": "Phoenix Commercial Pte. Ltd.",
    "confidence": 0.99
  },
  "customerName": {
    "value": "GD CARWASH PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "1800000528/26",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-02-01",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-15",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "68.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "6.12",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "74.12",
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
        "value": "PRM - Internet Subscription #B2-13 And 14 & 2 Lots GD CARWASH PTE. LTD. / GD Auto Detailing (01-Feb-2026 to 28-Feb-2026)",
        "confidence": 0.99
      },
      "quantity": null,
      "unitPrice": null,
      "amount": {
        "value": "68.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "6.12",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "6900",
        "confidence": 0.9
      }
    }
  ],
  "overallConfidence": 0.99
}
```
</details>

---

## Extraction Results - 2026-02-05T03:20:19.681Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | Phoenix Commercial Pte. Ltd. | 0.99 |
| Total Amount | 74.12 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6900 | 0.90 | PRM - Internet Subscription #B2-13 And 14 & 2 L... |

---

## AI Request - 2026-02-05T03:19:54.792Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 30908ms |
| Input Tokens | 6428 |
| Output Tokens | 686 |
| Total Tokens | 9284 |
| Estimated Cost | $0.0078 |

<details>
<summary>Response (1649 chars)</summary>

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
    "confidence": 0.95
  },
  "customerName": {
    "value": "GD Carwash Pte Ltd",
    "confidence": 0.98
  },
  "documentNumber": {
    "value": "C0000318",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-02-02",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-02",
    "confidence": 0.9
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "390.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "35.10",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "425.10",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "201805800K",
    "confidence": 0.85
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Season Parking (01 Mar 2026 - 31 May 2026) - Vehicle SNT7428H",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "390.00",
        "confidence": 0.9
      },
      "amount": {
        "value": "390.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "35.10",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7010",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.96
}
```
</details>

---

## Extraction Results - 2026-02-05T03:20:25.708Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.98 |
| Vendor | PHOENIX COMMERCIAL PTE LTD | 0.95 |
| Total Amount | 425.10 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7010 | 0.80 | Season Parking (01 Mar 2026 - 31 May 2026) - Ve... |

---

## AI Request - 2026-02-05T03:19:52.687Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 37053ms |
| Input Tokens | 6999 |
| Output Tokens | 697 |
| Total Tokens | 10464 |
| Estimated Cost | $0.0084 |

<details>
<summary>Response (1687 chars)</summary>

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
    "value": "PHOENIX COMMERCIAL PTE LTD",
    "confidence": 0.98
  },
  "customerName": {
    "value": "GD CARWASH PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "A118267",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-23",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-06",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "167.24",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "15.05",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "182.29",
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
        "value": "Current Charges (Utilities/Service) for period 1 Dec 2025 - 31 Dec 2025 - SPD Account AGP0001045",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "167.24",
        "confidence": 0.95
      },
      "amount": {
        "value": "167.24",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "15.05",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "7100",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-02-05T03:20:29.748Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | PHOENIX COMMERCIAL PTE LTD | 0.98 |
| Total Amount | 182.29 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7100 | 0.80 | Current Charges (Utilities/Service) for period ... |

---

## AI Request - 2026-02-05T03:19:54.066Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 40719ms |
| Input Tokens | 6435 |
| Output Tokens | 1066 |
| Total Tokens | 10508 |
| Estimated Cost | $0.0086 |

<details>
<summary>Response (2729 chars)</summary>

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
    "value": "SP Services Ltd",
    "confidence": 0.95
  },
  "customerName": {
    "value": "GD CARWASH PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "8955870749",
    "confidence": 0.9
  },
  "documentDate": {
    "value": "2026-01-28",
    "confidence": 0.99
  },
  "dueDate": {
    "value": "2026-02-11",
    "confidence": 0.99
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "21.99",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "1.98",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "23.97",
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
        "value": "Water Services usage estimated",
        "confidence": 0.99
      },
      "quantity": {
        "value": "6.8",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "1.4300",
        "confidence": 0.99
      },
      "amount": {
        "value": "9.72",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.87",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7120",
        "confidence": 0.95
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Waterborne Tax",
        "confidence": 0.99
      },
      "quantity": {
        "value": "6.8",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "1.0900",
        "confidence": 0.99
      },
      "amount": {
        "value": "7.41",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.67",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7120",
        "confidence": 0.95
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Water Conservation Tax",
        "confidence": 0.99
      },
      "quantity": null,
      "unitPrice": null,
      "amount": {
        "value": "4.86",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "0.44",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "7120",
        "confidence": 0.95
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-02-05T03:20:34.796Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_PAYABLE | 0.99 |
| Vendor | SP Services Ltd | 0.95 |
| Total Amount | 23.97 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 7120 | 0.95 | Water Services usage estimated |
| 2 | 7120 | 0.95 | Waterborne Tax |
| 3 | 7120 | 0.95 | Water Conservation Tax |

---

## AI Request - 2026-02-05T07:52:36.487Z

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
| Latency | 35308ms |
| Input Tokens | 4249 |
| Output Tokens | 1157 |
| Total Tokens | 7543 |
| Estimated Cost | $0.0066 |

<details>
<summary>Response (2959 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202527032W",
    "name": "MYLIFESTYLE SANITARY PTE. LTD.",
    "incorporationDate": "2025-06-23",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2025-06-23"
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
    "level": "04",
    "unit": "348G",
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
      "currency": "SINGAPORE DOLLAR",
      "numberOfShares": 100000,
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
      "nationality": "SINGAPORE CITIZEN",
      "address": "1 THOMSON ROAD, #04-348G, BALESTIER HILL SHOPPING CENTRE, SINGAPORE 300001",
      "shareClass": "ORDINARY",
      "numberOfShares": 51000,
      "currency": "SINGAPORE DOLLAR"
    },
    {
      "name": "TAN TIAN HOCK (CHEN TIANFU)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S7416573G",
      "nationality": "SINGAPORE CITIZEN",
      "address": "965 UPPER CHANGI ROAD NORTH, #01-33, SINGAPORE 507665",
      "shareClass": "ORDINARY",
      "numberOfShares": 49000,
      "currency": "SINGAPORE DOLLAR"
    }
  ],
  "officers": [
    {
      "name": "TAN MEI JUN, DAPHNE (CHEN MEIJUN, DAPHNE)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8413024I",
      "nationality": "SINGAPORE CITIZEN",
      "address": "1 THOMSON ROAD, #04-348G, BALESTIER HILL SHOPPING CENTRE, SINGAPORE 300001",
      "appointmentDate": "2025-06-23"
    },
    {
      "name": "TAN TIAN HOCK (CHEN TIANFU)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S7416573G",
      "nationality": "SINGAPORE CITIZEN",
      "address": "965 UPPER CHANGI ROAD NORTH, #01-33, SINGAPORE 507665",
      "appointmentDate": "2025-06-23"
    },
    {
      "name": "TAN TIAN HOCK (CHEN TIANFU)",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7416573G",
      "nationality": "SINGAPORE CITIZEN",
      "address": "965 UPPER CHANGI ROAD NORTH, #01-33, SINGAPORE 507665",
      "appointmentDate": "2025-06-23"
    }
  ],
  "homeCurrency": "SINGAPORE DOLLAR",
  "documentMetadata": {
    "receiptNo": "FREE",
    "receiptDate": "2025-06-23"
  }
}
```
</details>

---

## AI Request - 2026-02-05T08:12:15.309Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 77034ms |
| Input Tokens | 8603 |
| Output Tokens | 2438 |
| Total Tokens | 15889 |
| Estimated Cost | $0.0135 |

<details>
<summary>Response (6400 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TREASURY",
    "confidence": 0.99
  },
  "documentSubCategory": {
    "value": "BANK_STATEMENT",
    "confidence": 0.99
  },
  "vendorName": {
    "value": "OCBC Bank",
    "confidence": 0.99
  },
  "customerName": {
    "value": "MYLIFESTYLE SANITARY PTE. LTD.",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "604719641001",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 0.99
  },
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": null,
  "taxAmount": null,
  "totalAmount": {
    "value": "47702.14",
    "confidence": 0.99
  },
  "supplierGstNo": null,
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": "CHARGES 0000001053118117 Txn Charges Billing Billing Statement",
      "quantity": null,
      "unitPrice": null,
      "amount": "-10.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "6200"
    },
    {
      "lineNo": 2,
      "description": "FAST TRANSFER RENT MYLIFESTYLE SA RENT NOV DEC 25",
      "quantity": null,
      "unitPrice": null,
      "amount": "-8353.76",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "6700"
    },
    {
      "lineNo": 3,
      "description": "PAYMENT/TRANSFER OTHR S$ LIM KHEN YANG ERBER PayNow: QSMYLIFESTYLE SANITA",
      "quantity": null,
      "unitPrice": null,
      "amount": "3968.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 4,
      "description": "FAST PAYMENT COMM S$ LOK FOONG K ID FEE SA 129060",
      "quantity": null,
      "unitPrice": null,
      "amount": "-100.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "7250"
    },
    {
      "lineNo": 5,
      "description": "BILL PAYMENT CMS SGBP260112737951 SINGTEL",
      "quantity": null,
      "unitPrice": null,
      "amount": "-61.82",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "6900"
    },
    {
      "lineNo": 6,
      "description": "BILL PAYMENT CMS SGBP260112737952 SINGTEL",
      "quantity": null,
      "unitPrice": null,
      "amount": "-37.06",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "6900"
    },
    {
      "lineNo": 7,
      "description": "BILL PAYMENT CMS SGBP260112737953 SINGTEL",
      "quantity": null,
      "unitPrice": null,
      "amount": "-37.06",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "6900"
    },
    {
      "lineNo": 8,
      "description": "FAST PAYMENT OTHR S$ YOU TECHNOL TT YOUTRIP BUSIN",
      "quantity": null,
      "unitPrice": null,
      "amount": "-14500.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "5210"
    },
    {
      "lineNo": 9,
      "description": "FAST PAYMENT IVPT S$ CHAN SA 5167 PayNow: window works 3978",
      "quantity": null,
      "unitPrice": null,
      "amount": "-150.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "6800"
    },
    {
      "lineNo": 10,
      "description": "PAYMENT/TRANSFER OTHR S$ ZHANG YUXUAN PayNow: QSMYLIFESTYLE SANITA",
      "quantity": null,
      "unitPrice": null,
      "amount": "900.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 11,
      "description": "PAYMENT/TRANSFER IVPT 20TWENTYFIVE PTE. MLS-S-2602",
      "quantity": null,
      "unitPrice": null,
      "amount": "534.10",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 12,
      "description": "PAYMENT/TRANSFER OTHR S$ LAI SHIH KAE PayNow: QSMYLIFESTYLE SANITA",
      "quantity": null,
      "unitPrice": null,
      "amount": "1013.70",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 13,
      "description": "FAST TRANSFER REFU S$ MYLIFESTYLE REFUND PayNow: refund mls-s-r260 and com",
      "quantity": null,
      "unitPrice": null,
      "amount": "-104.50",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4130"
    },
    {
      "lineNo": 14,
      "description": "FAST PAYMENT IVPT TAN MEI JUN DA CLAIMS META ADS claims dec2025",
      "quantity": null,
      "unitPrice": null,
      "amount": "-2194.49",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "6100"
    },
    {
      "lineNo": 15,
      "description": "FAST PAYMENT BEXP TAN MEI JUN DA CLAIMS MATERIAL claims for material",
      "quantity": null,
      "unitPrice": null,
      "amount": "-119.46",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "5200"
    },
    {
      "lineNo": 16,
      "description": "PAYMENT/TRANSFER OTHR S$ ZHANG YUXUAN PayNow: QSMYLIFESTYLE SANITA",
      "quantity": null,
      "unitPrice": null,
      "amount": "909.40",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 17,
      "description": "PAYMENT/TRANSFER OTHR S$ TAN MEI JUN DAPHNE PayNow: QSMYLIFESTYLE SANITA",
      "quantity": null,
      "unitPrice": null,
      "amount": "700.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 18,
      "description": "PAYMENT/TRANSFER OTHR S$ TAN MEI JUN DAPHNE PayNow: QSMYLIFESTYLE SANITA",
      "quantity": null,
      "unitPrice": null,
      "amount": "600.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 19,
      "description": "PAYMENT/TRANSFER OTHR S$ ANG CHWEE LI JASMIN PayNow: QSMYLIFESTYLE SANITA",
      "quantity": null,
      "unitPrice": null,
      "amount": "2800.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 20,
      "description": "PAYMENT/TRANSFER OTHR S$ LEE TUCK KEONG PayNow: QSMYLIFESTYLE SANITA",
      "quantity": null,
      "unitPrice": null,
      "amount": "500.00",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4100"
    },
    {
      "lineNo": 21,
      "description": "INTEREST CREDIT",
      "quantity": null,
      "unitPrice": null,
      "amount": "0.09",
      "gstAmount": null,
      "taxCode": "NA",
      "accountCode": "4300"
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-02-05T08:13:32.358Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TREASURY | 0.99 |
| Vendor | OCBC Bank | 0.99 |
| Total Amount | 47702.14 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 6200 | 0.80 | CHARGES 0000001053118117 Txn Charges Billing Bi... |
| 2 | 6700 | 0.80 | FAST TRANSFER RENT MYLIFESTYLE SA RENT NOV DEC 25 |
| 3 | 4100 | 0.80 | PAYMENT/TRANSFER OTHR S$ LIM KHEN YANG ERBER Pa... |
| 4 | 7250 | 0.80 | FAST PAYMENT COMM S$ LOK FOONG K ID FEE SA 129060 |
| 5 | 6900 | 0.80 | BILL PAYMENT CMS SGBP260112737951 SINGTEL |
| 6 | 6900 | 0.80 | BILL PAYMENT CMS SGBP260112737952 SINGTEL |
| 7 | 6900 | 0.80 | BILL PAYMENT CMS SGBP260112737953 SINGTEL |
| 8 | 5210 | 0.80 | FAST PAYMENT OTHR S$ YOU TECHNOL TT YOUTRIP BUSIN |
| 9 | 6800 | 0.80 | FAST PAYMENT IVPT S$ CHAN SA 5167 PayNow: windo... |
| 10 | 4100 | 0.80 | PAYMENT/TRANSFER OTHR S$ ZHANG YUXUAN PayNow: Q... |
| 11 | 4100 | 0.80 | PAYMENT/TRANSFER IVPT 20TWENTYFIVE PTE. MLS-S-2602 |
| 12 | 4100 | 0.80 | PAYMENT/TRANSFER OTHR S$ LAI SHIH KAE PayNow: Q... |
| 13 | 4130 | 0.80 | FAST TRANSFER REFU S$ MYLIFESTYLE REFUND PayNow... |
| 14 | 6100 | 0.80 | FAST PAYMENT IVPT TAN MEI JUN DA CLAIMS META AD... |
| 15 | 5200 | 0.80 | FAST PAYMENT BEXP TAN MEI JUN DA CLAIMS MATERIA... |
| 16 | 4100 | 0.80 | PAYMENT/TRANSFER OTHR S$ ZHANG YUXUAN PayNow: Q... |
| 17 | 4100 | 0.80 | PAYMENT/TRANSFER OTHR S$ TAN MEI JUN DAPHNE Pay... |
| 18 | 4100 | 0.80 | PAYMENT/TRANSFER OTHR S$ TAN MEI JUN DAPHNE Pay... |
| 19 | 4100 | 0.80 | PAYMENT/TRANSFER OTHR S$ ANG CHWEE LI JASMIN Pa... |
| 20 | 4100 | 0.80 | PAYMENT/TRANSFER OTHR S$ LEE TUCK KEONG PayNow:... |
| 21 | 4300 | 0.80 | INTEREST CREDIT |

---

## AI Request - 2026-02-05T08:14:34.176Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 46089ms |
| Input Tokens | 7013 |
| Output Tokens | 632 |
| Total Tokens | 11026 |
| Estimated Cost | $0.0083 |

<details>
<summary>Response (1547 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_RECEIVABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "SALES_ORDER",
    "confidence": 0.9
  },
  "vendorName": {
    "value": "Mylifestyle Sanitary Pte Ltd",
    "confidence": 0.95
  },
  "customerName": {
    "value": "Mr lee",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "MLS-S-2606",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-01-30",
    "confidence": 0.95
  },
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "880.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "79.20",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "959.20",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "202527032W",
    "confidence": 0.85
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Zerco 81JG White",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "880.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "880.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "79.20",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4110",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-02-05T08:15:20.275Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_RECEIVABLE | 0.95 |
| Vendor | Mylifestyle Sanitary Pte Ltd | 0.95 |
| Total Amount | 959.20 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 4110 | 0.80 | Zerco 81JG White |

---

## AI Request - 2026-02-05T08:14:34.936Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 60306ms |
| Input Tokens | 6989 |
| Output Tokens | 1127 |
| Total Tokens | 12622 |
| Estimated Cost | $0.0092 |

<details>
<summary>Response (2870 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_RECEIVABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "SALES_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "Mylifestyle Sanitary Pte Ltd",
    "confidence": 0.95
  },
  "customerName": {
    "value": "20Twentyfive Pte Ltd",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "MLS-S-2602",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-01-16",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-04",
    "confidence": 0.85
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "1130.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "101.70",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "1231.70",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "202527032W",
    "confidence": 0.9
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "HV3-81JG White",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "880.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "880.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "79.20",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4110",
        "confidence": 0.8
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Hacking of ventaltion hole",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "100.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "100.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "9.00",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4200",
        "confidence": 0.8
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Install electrical switch and wire",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "150.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "150.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "13.50",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4200",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-02-05T08:15:35.252Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_RECEIVABLE | 0.95 |
| Vendor | Mylifestyle Sanitary Pte Ltd | 0.95 |
| Total Amount | 1231.70 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 4110 | 0.80 | HV3-81JG White |
| 2 | 4200 | 0.80 | Hacking of ventaltion hole |
| 3 | 4200 | 0.80 | Install electrical switch and wire |

---

## AI Request - 2026-02-05T08:14:33.459Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 69463ms |
| Input Tokens | 7013 |
| Output Tokens | 1582 |
| Total Tokens | 13634 |
| Estimated Cost | $0.0102 |

<details>
<summary>Response (4131 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_RECEIVABLE",
    "confidence": 0.99
  },
  "documentSubCategory": {
    "value": "SALES_ORDER",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "Mylifestyle Sanitary Pte Ltd",
    "confidence": 0.99
  },
  "customerName": {
    "value": "Jasmine Ang",
    "confidence": 0.99
  },
  "documentNumber": {
    "value": "MLS-S-2605",
    "confidence": 0.99
  },
  "documentDate": {
    "value": "2026-01-29",
    "confidence": 0.99
  },
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 0.99
  },
  "subtotal": {
    "value": "5040.00",
    "confidence": 0.99
  },
  "taxAmount": {
    "value": "453.60",
    "confidence": 0.99
  },
  "totalAmount": {
    "value": "5493.60",
    "confidence": 0.99
  },
  "supplierGstNo": {
    "value": "202527032W",
    "confidence": 0.9
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Huezentte 3 - Model: FHD3-C150P_MT - Colour: White",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "2580.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "2580.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "232.20",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "4110",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Huezentte Palette - Model: FHD2-C150P_Palette - Colour: White",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.99
      },
      "unitPrice": {
        "value": "2380.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "2380.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "214.20",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "4110",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Discount for 2 set and above",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "-200.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "-200.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "-18.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "4120",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "Discount for Wells customer",
        "confidence": 0.99
      },
      "quantity": {
        "value": "1",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "-100.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "-100.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "-9.00",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "4120",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "Additional 2 Year Warranty",
        "confidence": 0.99
      },
      "quantity": {
        "value": "2",
        "confidence": 0.9
      },
      "unitPrice": {
        "value": "190.00",
        "confidence": 0.99
      },
      "amount": {
        "value": "380.00",
        "confidence": 0.99
      },
      "gstAmount": {
        "value": "34.20",
        "confidence": 0.99
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.99
      },
      "accountCode": {
        "value": "4200",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.98
}
```
</details>

---

## Extraction Results - 2026-02-05T08:15:42.932Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_RECEIVABLE | 0.99 |
| Vendor | Mylifestyle Sanitary Pte Ltd | 0.99 |
| Total Amount | 5493.60 SGD | 0.99 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 4110 | 0.90 | Huezentte 3 - Model: FHD3-C150P_MT - Colour: White |
| 2 | 4110 | 0.90 | Huezentte Palette - Model: FHD2-C150P_Palette -... |
| 3 | 4120 | 0.90 | Discount for 2 set and above |
| 4 | 4120 | 0.90 | Discount for Wells customer |
| 5 | 4200 | 0.80 | Additional 2 Year Warranty |

---

## AI Request - 2026-02-05T08:24:00.898Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 64637ms |
| Input Tokens | 7009 |
| Output Tokens | 650 |
| Total Tokens | 12623 |
| Estimated Cost | $0.0083 |

<details>
<summary>Response (1563 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_RECEIVABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "SALES_ORDER",
    "confidence": 0.9
  },
  "vendorName": {
    "value": "Mylifestyle Sanitary Pte Ltd",
    "confidence": 0.95
  },
  "customerName": {
    "value": "Mr lee",
    "confidence": 0.9
  },
  "documentNumber": {
    "value": "MLS-S-2606",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-01-30",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-05",
    "confidence": 0.8
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "880.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "79.20",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "959.20",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "202527032W",
    "confidence": 0.7
  },
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Zerco 81JG - White",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "880.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "880.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "79.20",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4110",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-02-05T08:25:05.550Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_RECEIVABLE | 0.95 |
| Vendor | Mylifestyle Sanitary Pte Ltd | 0.95 |
| Total Amount | 959.20 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 4110 | 0.80 | Zerco 81JG - White |

---

## AI Request - 2026-02-05T08:24:11.262Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 56440ms |
| Input Tokens | 7009 |
| Output Tokens | 1577 |
| Total Tokens | 12410 |
| Estimated Cost | $0.0102 |

<details>
<summary>Response (4104 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_RECEIVABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "SALES_ORDER",
    "confidence": 0.9
  },
  "vendorName": {
    "value": "Mylifestyle Sanitary Pte Ltd",
    "confidence": 0.95
  },
  "customerName": {
    "value": "Jasmine Ang",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "MLS-S-2605",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-01-29",
    "confidence": 0.95
  },
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "5040.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "453.60",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "5493.60",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "202527032W",
    "confidence": 0.95
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Huezentte 3 - FHD3-C150P_MT (White)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "2580.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "2580.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "232.20",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4110",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Huezentte Palette - FHD2-C150P_Palette (White)",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "2380.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "2380.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "214.20",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4110",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Discount for 2 set and above",
        "confidence": 0.95
      },
      "quantity": {
        "value": "2",
        "confidence": 0.85
      },
      "unitPrice": {
        "value": "-100.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "-200.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "-18.00",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4120",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 4,
      "description": {
        "value": "Discount for Wells customer",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.85
      },
      "unitPrice": {
        "value": "-100.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "-100.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "-9.00",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4120",
        "confidence": 0.9
      }
    },
    {
      "lineNo": 5,
      "description": {
        "value": "Additional 2 Year Warranty",
        "confidence": 0.95
      },
      "quantity": {
        "value": "2",
        "confidence": 0.85
      },
      "unitPrice": {
        "value": "190.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "380.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "34.20",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4200",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-02-05T08:25:07.712Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_RECEIVABLE | 0.95 |
| Vendor | Mylifestyle Sanitary Pte Ltd | 0.95 |
| Total Amount | 5493.60 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 4110 | 0.90 | Huezentte 3 - FHD3-C150P_MT (White) |
| 2 | 4110 | 0.90 | Huezentte Palette - FHD2-C150P_Palette (White) |
| 3 | 4120 | 0.90 | Discount for 2 set and above |
| 4 | 4120 | 0.90 | Discount for Wells customer |
| 5 | 4200 | 0.80 | Additional 2 Year Warranty |

---

## AI Request - 2026-02-05T08:24:10.537Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 68039ms |
| Input Tokens | 6985 |
| Output Tokens | 1127 |
| Total Tokens | 13406 |
| Estimated Cost | $0.0092 |

<details>
<summary>Response (2870 chars)</summary>

```json
{
  "documentCategory": {
    "value": "ACCOUNTS_RECEIVABLE",
    "confidence": 0.95
  },
  "documentSubCategory": {
    "value": "SALES_INVOICE",
    "confidence": 0.95
  },
  "vendorName": {
    "value": "Mylifestyle Sanitary Pte Ltd",
    "confidence": 0.95
  },
  "customerName": {
    "value": "20Twentyfive Pte Ltd",
    "confidence": 0.95
  },
  "documentNumber": {
    "value": "MLS-S-2602",
    "confidence": 0.9
  },
  "documentDate": {
    "value": "2026-01-16",
    "confidence": 0.95
  },
  "dueDate": {
    "value": "2026-02-04",
    "confidence": 0.85
  },
  "currency": {
    "value": "SGD",
    "confidence": 0.95
  },
  "subtotal": {
    "value": "1130.00",
    "confidence": 0.95
  },
  "taxAmount": {
    "value": "101.70",
    "confidence": 0.95
  },
  "totalAmount": {
    "value": "1231.70",
    "confidence": 0.95
  },
  "supplierGstNo": {
    "value": "202527032W",
    "confidence": 0.85
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "HV3-81JG White",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "880.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "880.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "79.20",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4110",
        "confidence": 0.8
      }
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Hacking of ventaltion hole",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "100.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "100.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "9.00",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4200",
        "confidence": 0.8
      }
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Install electrical switch and wire",
        "confidence": 0.95
      },
      "quantity": {
        "value": "1",
        "confidence": 0.95
      },
      "unitPrice": {
        "value": "150.00",
        "confidence": 0.95
      },
      "amount": {
        "value": "150.00",
        "confidence": 0.95
      },
      "gstAmount": {
        "value": "13.50",
        "confidence": 0.95
      },
      "taxCode": {
        "value": "SR",
        "confidence": 0.95
      },
      "accountCode": {
        "value": "4200",
        "confidence": 0.8
      }
    }
  ],
  "overallConfidence": 0.95
}
```
</details>

---

## Extraction Results - 2026-02-05T08:25:18.589Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | ACCOUNTS_RECEIVABLE | 0.95 |
| Vendor | Mylifestyle Sanitary Pte Ltd | 0.95 |
| Total Amount | 1231.70 SGD | 0.95 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | 4110 | 0.80 | HV3-81JG White |
| 2 | 4200 | 0.80 | Hacking of ventaltion hole |
| 3 | 4200 | 0.80 | Install electrical switch and wire |

---

## AI Request - 2026-02-05T08:35:33.815Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 81354ms |
| Input Tokens | 8609 |
| Output Tokens | 754 |
| Total Tokens | 15932 |
| Estimated Cost | $0.0101 |

<details>
<summary>Response (1922 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TREASURY",
    "confidence": 1
  },
  "documentSubCategory": {
    "value": "BANK_STATEMENT",
    "confidence": 1
  },
  "vendorName": {
    "value": "OCBC Bank",
    "confidence": 1
  },
  "customerName": {
    "value": "MYLIFESTYLE SANITARY PTE. LTD.",
    "confidence": 1
  },
  "documentNumber": {
    "value": "604719641001",
    "confidence": 0.95
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 1
  },
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 1
  },
  "subtotal": {
    "value": "37593.44",
    "confidence": 0.6
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 1
  },
  "totalAmount": {
    "value": "47702.14",
    "confidence": 0.9
  },
  "supplierGstNo": {
    "value": "193200032W",
    "confidence": 0.9
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Total Withdrawals",
        "confidence": 1
      },
      "quantity": {
        "value": "1",
        "confidence": 1
      },
      "unitPrice": {
        "value": "25668.15",
        "confidence": 1
      },
      "amount": {
        "value": "25668.15",
        "confidence": 1
      },
      "gstAmount": null,
      "taxCode": {
        "value": "NA",
        "confidence": 1
      },
      "accountCode": null
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Total Deposits",
        "confidence": 1
      },
      "quantity": {
        "value": "1",
        "confidence": 1
      },
      "unitPrice": {
        "value": "11925.29",
        "confidence": 1
      },
      "amount": {
        "value": "11925.29",
        "confidence": 1
      },
      "gstAmount": null,
      "taxCode": {
        "value": "NA",
        "confidence": 1
      },
      "accountCode": null
    }
  ],
  "overallConfidence": 0.9
}
```
</details>

---

## Extraction Results - 2026-02-05T08:36:55.186Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TREASURY | 1.00 |
| Vendor | OCBC Bank | 1.00 |
| Total Amount | 47702.14 SGD | 0.90 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | ❌ NOT ASSIGNED | - | Total Withdrawals |
| 2 | ❌ NOT ASSIGNED | - | Total Deposits |

---

## AI Request - 2026-02-05T08:40:16.908Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | document_extraction |
| Model | gemini-3 |
| Provider | google |
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
| Latency | 44775ms |
| Input Tokens | 12325 |
| Output Tokens | 880 |
| Total Tokens | 16426 |
| Estimated Cost | $0.0141 |

<details>
<summary>Response (2363 chars)</summary>

```json
{
  "documentCategory": {
    "value": "TREASURY",
    "confidence": 1
  },
  "documentSubCategory": {
    "value": "BANK_STATEMENT",
    "confidence": 1
  },
  "vendorName": {
    "value": "OCBC Bank",
    "confidence": 1
  },
  "customerName": {
    "value": "GD CARWASH PTE. LTD.",
    "confidence": 1
  },
  "documentNumber": {
    "value": "604716910001",
    "confidence": 1
  },
  "documentDate": {
    "value": "2026-01-31",
    "confidence": 1
  },
  "dueDate": null,
  "currency": {
    "value": "SGD",
    "confidence": 1
  },
  "subtotal": {
    "value": "93023.41",
    "confidence": 0.9
  },
  "taxAmount": {
    "value": "0.00",
    "confidence": 0.9
  },
  "totalAmount": {
    "value": "93023.41",
    "confidence": 1
  },
  "supplierGstNo": {
    "value": "193200032W",
    "confidence": 0.9
  },
  "homeCurrencyEquivalent": null,
  "lineItems": [
    {
      "lineNo": 1,
      "description": {
        "value": "Opening Balance",
        "confidence": 1
      },
      "quantity": {
        "value": "1",
        "confidence": 1
      },
      "unitPrice": {
        "value": "86670.55",
        "confidence": 1
      },
      "amount": {
        "value": "86670.55",
        "confidence": 1
      },
      "gstAmount": null,
      "taxCode": {
        "value": "NA",
        "confidence": 1
      },
      "accountCode": null
    },
    {
      "lineNo": 2,
      "description": {
        "value": "Total Deposits",
        "confidence": 1
      },
      "quantity": {
        "value": "1",
        "confidence": 1
      },
      "unitPrice": {
        "value": "34691.93",
        "confidence": 1
      },
      "amount": {
        "value": "34691.93",
        "confidence": 1
      },
      "gstAmount": null,
      "taxCode": {
        "value": "NA",
        "confidence": 1
      },
      "accountCode": null
    },
    {
      "lineNo": 3,
      "description": {
        "value": "Total Withdrawals",
        "confidence": 1
      },
      "quantity": {
        "value": "1",
        "confidence": 1
      },
      "unitPrice": {
        "value": "-28339.07",
        "confidence": 1
      },
      "amount": {
        "value": "-28339.07",
        "confidence": 1
      },
      "gstAmount": null,
      "taxCode": {
        "value": "NA",
        "confidence": 1
      },
      "accountCode": null
    }
  ],
  "overallConfidence": 1
}
```
</details>

---

## Extraction Results - 2026-02-05T08:41:01.699Z

### Document Fields
| Field | Value | Confidence |
|-------|-------|------------|
| Document Category | TREASURY | 1.00 |
| Vendor | OCBC Bank | 1.00 |
| Total Amount | 93023.41 SGD | 1.00 |

### Line Item Account Codes
| Line | Account Code | Confidence | Description |
|------|--------------|------------|-------------|
| 1 | ❌ NOT ASSIGNED | - | Opening Balance |
| 2 | ❌ NOT ASSIGNED | - | Total Deposits |
| 3 | ❌ NOT ASSIGNED | - | Total Withdrawals |

---

## AI Request - 2026-02-05T10:07:29.768Z

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
| Latency | 33881ms |
| Input Tokens | 4309 |
| Output Tokens | 833 |
| Total Tokens | 7665 |
| Estimated Cost | $0.0060 |

<details>
<summary>Response (2093 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "202449207H",
    "name": "AFFINITYWORKS PTE. LTD.",
    "incorporationDate": "2024-12-01",
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2024-12-01"
  },
  "ssicActivities": {
    "primary": {
      "code": "78300",
      "description": "MANAGEMENT OF HUMAN RESOURCE FUNCTIONS"
    }
  },
  "registeredAddress": {
    "block": "135",
    "streetName": "MIDDLE ROAD",
    "level": "02",
    "unit": "27",
    "buildingName": "BYLANDS BUILDING",
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
      "name": "TEO HWI WOON",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8426458Z",
      "nationality": "SINGAPORE CITIZEN",
      "address": "25C SURIN AVENUE CHARLTON 27 SINGAPORE (533968)",
      "shareClass": "ORDINARY",
      "numberOfShares": 5000,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "TEO HWI WOON",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8426458Z",
      "nationality": "SINGAPORE CITIZEN",
      "address": "25C SURIN AVENUE CHARLTON 27 SINGAPORE (533968)",
      "appointmentDate": "2024-12-01"
    },
    {
      "name": "LOH ZHI XIANG",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S8848369C",
      "nationality": "SINGAPORE CITIZEN",
      "address": "135 MIDDLE ROAD #02-27 BYLANDS BUILDING SINGAPORE (188975)",
      "appointmentDate": "2024-12-01"
    }
  ],
  "compliance": {
    "lastAgmDate": null,
    "lastArFiledDate": null,
    "fyeAsAtLastAr": null
  },
  "documentMetadata": {
    "receiptNo": "ACRA241201007117",
    "receiptDate": "2024-12-01"
  }
}
```
</details>

---

## AI Request - 2026-02-05T10:07:36.974Z

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
| Latency | 54101ms |
| Input Tokens | 4309 |
| Output Tokens | 1237 |
| Total Tokens | 9620 |
| Estimated Cost | $0.0068 |

<details>
<summary>Response (3088 chars)</summary>

```json
{
  "entityDetails": {
    "uen": "201927349Z",
    "name": "CLICKSHARE MEDIA VENTURES PTE. LTD.",
    "dateOfNameChange": null,
    "entityType": "EXEMPTED_PRIVATE_LIMITED",
    "status": "LIVE",
    "statusDate": "2019-08-21",
    "incorporationDate": "2019-08-21"
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
      "isPaidUp": true,
      "isTreasury": false
    }
  ],
  "shareholders": [
    {
      "name": "KIM DO WAN",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S9287158D",
      "nationality": "AMERICAN",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "shareClass": "ORDINARY",
      "numberOfShares": 50,
      "currency": "SGD"
    },
    {
      "name": "TAN SU-YU, MICHELLE (CHEN SUYU)",
      "type": "INDIVIDUAL",
      "identificationType": "NRIC",
      "identificationNumber": "S8623295B",
      "nationality": "SINGAPORE CITIZEN",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "shareClass": "ORDINARY",
      "numberOfShares": 50,
      "currency": "SGD"
    }
  ],
  "officers": [
    {
      "name": "ISHWINDER SINGH",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7655906F",
      "nationality": "SINGAPORE CITIZEN",
      "address": "121 TANJONG RHU ROAD, #18-35, TANJONG RIA CONDOMINIUM, SINGAPORE 436914",
      "appointmentDate": "2022-11-15"
    },
    {
      "name": "SABA KHAN",
      "role": "SECRETARY",
      "identificationType": "NRIC",
      "identificationNumber": "S7686336I",
      "nationality": "INDIAN",
      "address": "8 MARINA VIEW, #43-068, ASIA SQUARE TOWER 1, SINGAPORE 018960",
      "appointmentDate": "2022-11-15"
    },
    {
      "name": "TAN SU-YU, MICHELLE (CHEN SUYU)",
      "role": "DIRECTOR",
      "identificationType": "NRIC",
      "identificationNumber": "S8623295B",
      "nationality": "SINGAPORE CITIZEN",
      "address": "8 ALEXANDRA VIEW, #22-07, THE METROPOLITAN CONDOMINIUM, SINGAPORE 158747",
      "appointmentDate": "2019-08-21"
    }
  ],
  "financialYear": {
    "endDay": 31,
    "endMonth": 12
  },
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

