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
| Phase 1 | Exchange Rate Maintenance | In Development |
| Phase 2 | Home Currency Conversion | Planned |

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

### 3.1 Document Processing Integration

When a document's currency differs from the company's home currency, automatically display converted amounts.

#### Fields Added to UI

| Field | Description |
|-------|-------------|
| Home Currency | Company's home currency (from Company.homeCurrency) |
| Exchange Rate | Rate used for conversion |
| Rate Source | Where the rate came from (MAS/Manual) |
| Rate Date | Date of the exchange rate |
| Home Subtotal | Subtotal converted to home currency |
| Home Tax Amount | Tax amount converted to home currency |
| Home Total Amount | Total amount converted to home currency |

#### Existing Schema Fields (DocumentRevision)

These fields already exist in the schema:
```prisma
homeCurrency       String?               // Company's home currency
homeExchangeRate   Decimal?              // Rate used for conversion
homeEquivalent     Decimal?              // Total in home currency
exchangeRateSource String?               // "MAS_DAILY" or "MANUAL"
exchangeRateDate   DateTime?             // Date of the rate
```

### 3.2 Conversion Logic

```typescript
// When document currency !== company home currency
if (documentCurrency !== company.homeCurrency) {
  const rate = await getRate(
    documentCurrency,
    company.homeCurrency,
    documentDate,
    company.tenantId
  );

  if (rate) {
    revision.homeCurrency = company.homeCurrency;
    revision.homeExchangeRate = rate.rate;
    revision.homeEquivalent = subtotal * rate.rate;
    revision.exchangeRateSource = rate.source;
    revision.exchangeRateDate = rate.rateDate;
  }
}
```

### 3.3 UI Mockup

```
┌─────────────────────────────────────────────────────────────┐
│ Document Details                                             │
├─────────────────────────────────────────────────────────────┤
│ Currency: USD                    Document Date: 2025-01-15  │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ AMOUNTS                                                  │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Subtotal:     USD 1,000.00                              │ │
│ │ Tax Amount:   USD   90.00                               │ │
│ │ Total:        USD 1,090.00                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ HOME CURRENCY (SGD)                    Rate: 1.3456     │ │
│ │ Source: MAS Daily | Date: 2025-01-15                    │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Home Subtotal:     SGD 1,345.60                         │ │
│ │ Home Tax Amount:   SGD   121.10                         │ │
│ │ Home Total:        SGD 1,466.70                         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Extraction Enhancement

The AI extraction prompt will be updated to look for:
- Exchange rate mentioned on document
- Amounts in multiple currencies
- Base currency indicators

If the source document contains exchange rate information, it will be extracted and used instead of the system rate.

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
