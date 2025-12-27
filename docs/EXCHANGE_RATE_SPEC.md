# Exchange Rate & Home Currency Conversion - Project Specification

This document specifies the exchange rate maintenance and home currency conversion features for Oakcloud's document processing module.

## Table of Contents

- [1. Overview](#1-overview)
- [2. Phase 1: Exchange Rate Maintenance](#2-phase-1-exchange-rate-maintenance)
- [3. Phase 2: Home Currency Conversion](#3-phase-2-home-currency-conversion)
- [4. Technical Architecture](#4-technical-architecture)
- [5. UI/UX Design](#5-uiux-design)
- [6. API Reference](#6-api-reference)
- [7. Configuration](#7-configuration)

---

## 1. Overview

### Purpose

Enable multi-currency support for document processing by:
1. Maintaining exchange rates from MAS (Monetary Authority of Singapore)
2. Converting document amounts to the company's home currency

### Scope

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | Exchange Rate Maintenance | ✅ Complete |
| Phase 2 | Home Currency Conversion | ✅ Complete |

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│     MAS API     │────▶│  Exchange Rate   │────▶│    Document       │
│  (Daily Rates)  │     │     Service      │     │   Processing      │
└─────────────────┘     └──────────────────┘     └───────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Admin UI       │
                        │ (Manual Rates)   │
                        └──────────────────┘
```

---

## 2. Phase 1: Exchange Rate Maintenance

### 2.1 MAS API Integration

#### API Details

| Property | Value |
|----------|-------|
| Endpoint | `https://eservices.mas.gov.sg/api/action/datastore/search.json` |
| Resource ID | `95932927-c8bc-4e7a-b484-68a66a24edfe` |
| Authentication | None (Public API) |
| Rate Limit | Not specified, use reasonable intervals |
| Update Frequency | Daily (rates updated ~6pm SGT previous day) |

#### Supported Currencies

All rates are quoted against SGD (Singapore Dollar):

| Code | Name | MAS Field | Divisor |
|------|------|-----------|---------|
| USD | US Dollar | `usd_sgd` | 1 |
| EUR | Euro | `eur_sgd` | 1 |
| GBP | British Pound | `gbp_sgd` | 1 |
| JPY | Japanese Yen | `jpy_100_sgd` | 100 |
| AUD | Australian Dollar | `aud_sgd` | 1 |
| CNY | Chinese Yuan | `cny_100_sgd` | 100 |
| HKD | Hong Kong Dollar | `hkd_100_sgd` | 100 |
| INR | Indian Rupee | `inr_100_sgd` | 100 |
| IDR | Indonesian Rupiah | `idr_100_sgd` | 100 |
| KRW | Korean Won | `krw_100_sgd` | 100 |
| MYR | Malaysian Ringgit | `myr_100_sgd` | 100 |
| NZD | New Zealand Dollar | `nzd_sgd` | 1 |
| PHP | Philippine Peso | `php_100_sgd` | 100 |
| QAR | Qatari Riyal | `qar_100_sgd` | 100 |
| SAR | Saudi Riyal | `sar_100_sgd` | 100 |
| CHF | Swiss Franc | `chf_sgd` | 1 |
| TWD | Taiwan Dollar | `twd_100_sgd` | 100 |
| THB | Thai Baht | `thb_100_sgd` | 100 |
| AED | UAE Dirham | `aed_100_sgd` | 100 |
| VND | Vietnamese Dong | `vnd_100_sgd` | 100 |

#### Rate Parsing

MAS provides rates in "foreign currency per SGD" format. For example:
- `usd_sgd: 1.3456` means 1 USD = 1.3456 SGD

For currencies with divisor > 1:
- `jpy_100_sgd: 0.9123` means 100 JPY = 0.9123 SGD, so 1 JPY = 0.009123 SGD

### 2.2 Database Schema

```prisma
enum ExchangeRateSource {
  MAS_DAILY    // Synced from MAS API
  MANUAL       // Manually entered by admin
}

model ExchangeRate {
  id                String             @id @default(uuid())
  tenantId          String?            @map("tenant_id")      // null = system-wide
  tenant            Tenant?            @relation(...)
  sourceCurrency    String             @map("source_currency") // USD, EUR, etc.
  targetCurrency    String             @default("SGD")         // Always SGD for MAS
  rate              Decimal            @db.Decimal(18, 8)      // High precision
  inverseRate       Decimal?           @db.Decimal(18, 8)      // 1/rate
  source            ExchangeRateSource @default(MAS_DAILY)
  rateDate          DateTime           @db.Date                // Effective date
  isManualOverride  Boolean            @default(false)
  manualReason      String?                                    // Required for manual
  createdById       String?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  @@unique([tenantId, sourceCurrency, targetCurrency, rateDate, source])
  @@index([sourceCurrency, rateDate])
  @@map("exchange_rates")
}
```

### 2.3 Rate Scoping

#### Scope Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    RATE LOOKUP PRIORITY                      │
├─────────────────────────────────────────────────────────────┤
│  1. Tenant Override (Manual)  - tenantId + isManualOverride │
│  2. System Rate (MAS Daily)   - tenantId = null             │
│  3. Fallback (Latest)         - Most recent available rate  │
└─────────────────────────────────────────────────────────────┘
```

#### Access Control

| Role | System Rates | Tenant Overrides |
|------|--------------|------------------|
| SUPER_ADMIN | Full CRUD | Full CRUD |
| TENANT_ADMIN | Read Only | Full CRUD |
| Other Users | Read Only | Read Only |

### 2.4 Scheduled Sync

| Property | Value |
|----------|-------|
| Task ID | `exchange-rate-sync` |
| Default Schedule | `0 6 * * *` (6am daily SGT) |
| Trigger | Automatic (cron) or Manual (admin UI) |

#### Sync Process

1. Fetch latest rates from MAS API
2. Parse and normalize rates (handle divisors)
3. Upsert system rates (tenantId = null)
4. Log results to audit trail
5. Report success/failure count

### 2.5 Admin UI Features

#### Exchange Rates Page (`/admin/exchange-rates`)

**Header Section:**
- Title: "Exchange Rates" with DollarSign icon
- Actions: "Sync from MAS" button (SUPER_ADMIN), "Add Manual Rate" button

**Filters:**
- Date picker (rate date)
- Currency dropdown (all supported currencies)
- Source filter (All / MAS Daily / Manual)
- Scope filter (All / System / Tenant) - SUPER_ADMIN only

**Table Columns:**
| Column | Description |
|--------|-------------|
| Currency | Source currency code (e.g., "USD") |
| Rate | Exchange rate (e.g., "1.3456") |
| Inverse | 1/rate for reverse conversion |
| Source | Badge: MAS (blue) or Manual (yellow) |
| Scope | Badge: System (purple) or Tenant (blue) |
| Rate Date | Effective date |
| Actions | Edit/Delete (for manual rates only) |

**Modals:**
- Create/Edit Manual Rate
  - Currency dropdown
  - Rate input (decimal)
  - Rate date picker
  - Reason textarea (required)

---

## 3. Phase 2: Home Currency Conversion

### 3.1 Overview

Home currency conversion enables line-item level conversion with:
- **2 decimal place precision** for all converted amounts
- **Line item level conversion** (not just header totals)
- **Silent rounding adjustment** applied to first non-overridden line item
- **Always visible** home currency section (greyed out when same as document currency)
- **User overrides** for all calculated home currency fields

### 3.2 Database Schema

#### DocumentRevision (Header Level)

```prisma
// Home currency conversion fields
homeCurrency               String?   // Company's home currency (e.g., "SGD")
homeExchangeRate           Decimal?  @db.Decimal(18, 4) // Rate used for conversion
homeExchangeRateSource     String?   // "MAS_DAILY" or "MANUAL"
exchangeRateDate           DateTime? @db.Date           // Date of the rate
homeSubtotal               Decimal?  @db.Decimal(18, 4) // Subtotal in home currency
homeTaxAmount              Decimal?  @db.Decimal(18, 4) // Tax in home currency
homeEquivalent             Decimal?  @db.Decimal(18, 4) // Total in home currency
isHomeExchangeRateOverride Boolean   @default(false)    // User overrode exchange rate
```

#### DocumentRevisionLineItem (Line Level)

```prisma
// Home currency conversion fields
homeAmount            Decimal?  @db.Decimal(18, 4) // Line amount in home currency
homeGstAmount         Decimal?  @db.Decimal(18, 4) // Line GST in home currency
isHomeAmountOverride  Boolean   @default(false)    // User overrode home amount
isHomeGstOverride     Boolean   @default(false)    // User overrode home GST
```

### 3.3 Conversion Logic

#### Helper Functions (`exchange-rate.service.ts`)

```typescript
/**
 * Convert amount to home currency (2 decimal places)
 */
export function convertToHomeCurrency(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

/**
 * Convert line items with rounding adjustment to first non-overridden line
 * Ensures sum of line home amounts equals header home total exactly
 */
export function convertLineItemsWithRounding(
  lineItems: LineItemForConversion[],
  rate: number,
  headerHomeTotal: number
): ConvertedLineItem[] {
  // 1. Convert each line item
  const converted = lineItems.map((item) => ({
    homeAmount: item.isOverride && item.homeAmount != null
      ? item.homeAmount
      : convertToHomeCurrency(item.amount, rate),
    homeGstAmount: item.gstAmount != null
      ? convertToHomeCurrency(item.gstAmount, rate)
      : null,
  }));

  // 2. Calculate sum
  const sum = converted.reduce((acc, item) =>
    acc + item.homeAmount + (item.homeGstAmount || 0), 0);

  // 3. Apply rounding difference to first non-overridden line
  const diff = Math.round((headerHomeTotal - sum) * 100) / 100;
  if (diff !== 0) {
    const firstNonOverride = converted.findIndex((_, i) => !lineItems[i].isOverride);
    if (firstNonOverride >= 0) {
      converted[firstNonOverride].homeAmount += diff;
    }
  }

  return converted;
}

/**
 * Calculate header home amounts from document amounts
 */
export function calculateHomeHeaderAmounts(
  subtotal: number | null,
  taxAmount: number | null,
  totalAmount: number,
  rate: number
): { homeSubtotal: number | null; homeTaxAmount: number | null; homeTotal: number } {
  return {
    homeSubtotal: subtotal != null ? convertToHomeCurrency(subtotal, rate) : null,
    homeTaxAmount: taxAmount != null ? convertToHomeCurrency(taxAmount, rate) : null,
    homeTotal: convertToHomeCurrency(totalAmount, rate),
  };
}
```

### 3.4 Validation Rules

Added to `document-revision.service.ts`:

| Code | Severity | Message |
|------|----------|---------|
| `MISSING_EXCHANGE_RATE` | WARN | Exchange rate required when currencies differ |
| `INVALID_EXCHANGE_RATE` | ERROR | Exchange rate must be positive |
| `HOME_AMOUNT_SUM_MISMATCH` | WARN | Line item home amounts don't match home subtotal |
| `HOME_GST_SUM_MISMATCH` | WARN | Line item home GST doesn't match home tax |
| `HOME_TOTAL_MISMATCH` | WARN | Home total doesn't match subtotal + tax |

### 3.5 UI Behavior

#### Same Currency (Document = Home)
- Home currency section is **always visible** but **greyed out**
- Exchange rate shows "1.0000" (1:1)
- All fields are **not editable**
- Values mirror document amounts exactly

#### Different Currency
- Home currency section is **fully editable** in edit mode
- Exchange rate can be refreshed from MAS or manually overridden
- All home amounts are **calculated** but **overridable**
- Override flags track which fields were manually changed

### 3.6 UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ Document Details                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Currency: USD                       Document Date: 2025-01-15   │
│                                                                  │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ AMOUNTS (DOCUMENT CURRENCY)                                │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ Subtotal:     USD 1,000.00                                │   │
│ │ Tax Amount:   USD    90.00                                │   │
│ │ Total:        USD 1,090.00                                │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ HOME CURRENCY                                   SGD        │   │
│ │ Rate: 1.3456 (MAS Daily | 2025-01-15)          [Refresh]  │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ Home Subtotal:     SGD 1,345.60                           │   │
│ │ Home Tax:          SGD   121.10                           │   │
│ │ Home Total:        SGD 1,466.70                           │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ LINE ITEMS                                                 │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ # │ Description │ Qty │ Price │ Amount │ GST  │HomeAmt│HmGST│ │
│ │───┼─────────────┼─────┼───────┼────────┼──────┼───────┼─────│ │
│ │ 1 │ Item A      │  2  │ 250.00│ 500.00 │ 45.00│ 673.28│60.60│ │
│ │ 2 │ Item B      │  1  │ 500.00│ 500.00 │ 45.00│ 673.00│60.50│ │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ Total                        │1,000.00│ 90.00│1345.60│121.10│ │
│ └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Note: First line item (Item A) includes +0.28 rounding adjustment
      so line totals (673.28+673.00=1346.28→rounds to 1345.60 header)
```

### 3.7 API Changes

#### GET `/api/processing-documents/:documentId/revisions/:revisionId`

Response includes:
```json
{
  "data": {
    // ... existing fields ...
    "homeCurrency": "SGD",
    "homeExchangeRate": "1.3456",
    "homeExchangeRateSource": "MAS_DAILY",
    "exchangeRateDate": "2025-01-15",
    "homeSubtotal": "1345.60",
    "homeTaxAmount": "121.10",
    "homeEquivalent": "1466.70",
    "isHomeExchangeRateOverride": false,
    "lineItems": [
      {
        // ... existing fields ...
        "homeAmount": "673.28",
        "homeGstAmount": "60.60",
        "isHomeAmountOverride": false,
        "isHomeGstOverride": false
      }
    ]
  }
}
```

#### PATCH `/api/processing-documents/:documentId/revisions/:revisionId`

Request body supports:
```json
{
  "headerUpdates": {
    // ... existing fields ...
    "homeCurrency": "SGD",
    "homeExchangeRate": "1.3456",
    "homeExchangeRateSource": "MAS_DAILY",
    "exchangeRateDate": "2025-01-15",
    "homeSubtotal": "1345.60",
    "homeTaxAmount": "121.10",
    "homeEquivalent": "1466.70",
    "isHomeExchangeRateOverride": true
  },
  "itemsToUpsert": [
    {
      // ... existing fields ...
      "homeAmount": "673.28",
      "homeGstAmount": "60.60",
      "isHomeAmountOverride": false,
      "isHomeGstOverride": false
    }
  ]
}
```

---

## 4. Technical Architecture

### 4.1 Service Layer

```
src/
├── lib/
│   ├── external/
│   │   └── mas-api.ts           # MAS API client
│   └── validations/
│       └── exchange-rate.ts     # Zod schemas
├── services/
│   └── exchange-rate.service.ts # Business logic
└── hooks/
    └── use-exchange-rates.ts    # React Query hooks
```

### 4.2 Rate Lookup Algorithm

```typescript
async function getRate(
  sourceCurrency: string,
  targetCurrency: string,
  date: Date,
  tenantId?: string
): Promise<RateLookupResult | null> {
  // 1. Check tenant override (if tenantId provided)
  if (tenantId) {
    const tenantRate = await findTenantRate(tenantId, sourceCurrency, date);
    if (tenantRate) return { ...tenantRate, source: 'tenant_override' };
  }

  // 2. Check system rate
  const systemRate = await findSystemRate(sourceCurrency, date);
  if (systemRate) return { ...systemRate, source: 'system' };

  // 3. Fallback to latest available
  const latestRate = await findLatestRate(sourceCurrency);
  if (latestRate) return { ...latestRate, source: 'fallback' };

  return null;
}
```

### 4.3 Error Handling

| Error | Handling |
|-------|----------|
| MAS API unavailable | Log error, skip sync, retry next scheduled run |
| Rate not found | Return null, UI shows "Rate unavailable" |
| Invalid rate data | Skip currency, log warning, continue with others |
| Database error | Rollback transaction, log error, notify admin |

---

## 5. UI/UX Design

### 5.1 Design Compliance

All UI follows [DESIGN_GUIDELINE.md](./DESIGN_GUIDELINE.md):
- Admin page layout with icon in header
- Mobile card view for responsive design
- Badge components for Source/Scope indicators
- Standard button sizes and spacing

### 5.2 Component Patterns

**Rate Display:**
```tsx
<span className="font-mono text-sm">
  {formatRate(rate, 6)} {/* 6 decimal places */}
</span>
```

**Source Badge:**
```tsx
<span className={cn(
  'badge',
  source === 'MAS_DAILY' ? 'badge-info' : 'badge-warning'
)}>
  {source === 'MAS_DAILY' ? 'MAS' : 'Manual'}
</span>
```

**Scope Badge:**
```tsx
<span className={cn(
  'badge',
  isSystem ? 'bg-purple-100 text-purple-800' : 'badge-info'
)}>
  {isSystem ? 'System' : 'Tenant'}
</span>
```

---

## 6. API Reference

### 6.1 Endpoints

#### List Exchange Rates
```
GET /api/admin/exchange-rates
```

Query parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `tenantId` | string | Filter by tenant (SUPER_ADMIN only) |
| `sourceCurrency` | string | Filter by currency code |
| `startDate` | date | Filter from date |
| `endDate` | date | Filter to date |
| `source` | enum | `MAS_DAILY`, `MANUAL`, or `ALL` |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 50) |

Response:
```json
{
  "rates": [...],
  "page": 1,
  "limit": 50,
  "total": 100,
  "totalPages": 2
}
```

#### Trigger Manual Sync
```
POST /api/admin/exchange-rates/sync
```

Access: SUPER_ADMIN only

Response:
```json
{
  "success": true,
  "ratesCreated": 20,
  "ratesUpdated": 0,
  "errors": [],
  "syncedAt": "2025-01-15T06:00:00Z"
}
```

#### Create Manual Rate
```
POST /api/admin/exchange-rates
```

Body:
```json
{
  "tenantId": "uuid | null",
  "sourceCurrency": "USD",
  "rate": 1.3456,
  "rateDate": "2025-01-15",
  "reason": "Manual rate for special transaction"
}
```

#### Lookup Rate
```
GET /api/admin/exchange-rates/lookup
```

Query parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `currency` | string | Source currency code |
| `date` | date | Rate date |
| `tenantId` | string | Optional tenant context |

Response:
```json
{
  "rate": 1.3456,
  "inverseRate": 0.7431,
  "source": "system",
  "rateDate": "2025-01-15",
  "exchangeRateSource": "MAS_DAILY"
}
```

---

## 7. Configuration

### 7.1 Environment Variables

```bash
# Exchange Rate Sync Scheduler
SCHEDULER_EXCHANGE_RATE_SYNC_ENABLED=true
SCHEDULER_EXCHANGE_RATE_SYNC_CRON="0 6 * * *"  # 6am daily SGT
```

### 7.2 Scheduler Task

The sync task is registered with the existing scheduler system:

```typescript
// src/lib/scheduler/tasks/exchange-rate-sync.task.ts
export const exchangeRateSyncTask: TaskRegistration = {
  id: 'exchange-rate-sync',
  name: 'Exchange Rate Sync',
  description: 'Syncs daily exchange rates from MAS API',
  defaultCronPattern: '0 6 * * *',
  execute: executeExchangeRateSyncTask,
};
```

### 7.3 Rate Precision

| Field | Precision | Example |
|-------|-----------|---------|
| rate | Decimal(18, 8) | 1.34567890 |
| inverseRate | Decimal(18, 8) | 0.74312156 |
| Amount conversions | Decimal(18, 4) | 1,345.6000 |

---

## Appendix: Audit Actions

New audit actions for exchange rate operations:

| Action | Description |
|--------|-------------|
| `EXCHANGE_RATE_SYNCED` | Batch sync from MAS completed |
| `EXCHANGE_RATE_CREATED` | Manual rate created |
| `EXCHANGE_RATE_UPDATED` | Rate updated |
| `EXCHANGE_RATE_DELETED` | Rate deleted |
