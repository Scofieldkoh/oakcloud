/**
 * ACRA Records API Routes (admin)
 *
 * GET /api/admin/acra-records - List locally mirrored ACRA entities with
 * pagination, inline filters (including date ranges), and sorting. Includes
 * the sync state summary so the UI can show how fresh the data is.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const SORT_FIELDS = new Set([
  'uen',
  'entityName',
  'entityStatus',
  'entityType',
  'companyTypeDescription',
  'registrationIncorporateDate',
  'block',
  'streetName',
  'levelNo',
  'unitNo',
  'buildingName',
  'postalCode',
  'address',
  'accountDueDate',
  'annualReturnDate',
  'primarySsicCode',
  'primarySsicDescription',
  'secondarySsicCode',
  'secondarySsicDescription',
  'noOfOfficers',
  'formerEntityName1',
  'uenOfAuditFirm1',
  'dataAsOf',
  'createdAt',
  'updatedAt',
]);

/** Fields with a free-text inline filter (matched with contains/insensitive). */
const TEXT_FILTER_FIELDS = [
  'uen',
  'entityName',
  'entityStatus',
  'entityType',
  'companyTypeDescription',
  'address',
  'primarySsicCode',
  'primarySsicDescription',
  'secondarySsicCode',
  'secondarySsicDescription',
  'noOfOfficers',
  'formerEntityName1',
  'uenOfAuditFirm1',
  'block',
  'streetName',
  'levelNo',
  'unitNo',
  'buildingName',
  'postalCode',
] as const;

/** Date fields stored as plain ISO YYYY-MM-DD strings (range compared lexicographically). */
const STRING_DATE_FIELDS = [
  'registrationIncorporateDate',
  'accountDueDate',
  'annualReturnDate',
] as const;

/** Convert a local YYYY-MM-DD date to the start of its UTC day. */
function dayStartIso(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

/** Convert a local YYYY-MM-DD date to the end of its UTC day. */
function dayEndIso(dateString: string): Date {
  return new Date(`${dateString}T23:59:59.999Z`);
}

function addDayRange(
  and: Prisma.AcraEntityWhereInput[],
  field: 'createdAt' | 'updatedAt',
  from: string | undefined,
  to: string | undefined
): void {
  if (!from && !to) return;
  const range: Prisma.DateTimeFilter = {};
  if (from) range.gte = dayStartIso(from);
  if (to) range.lte = dayEndIso(to);
  and.push({ [field]: range });
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );

    const rawSortBy = searchParams.get('sortBy') || 'entityName';
    const sortByIsValid = SORT_FIELDS.has(rawSortBy);
    const sortBy = sortByIsValid ? rawSortBy : 'entityName';
    const sortOrder = sortByIsValid && searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';

    const search = searchParams.get('search')?.trim() || undefined;
    const createdAtFrom = searchParams.get('createdAtFrom') || undefined;
    const createdAtTo = searchParams.get('createdAtTo') || undefined;
    const updatedAtFrom = searchParams.get('updatedAtFrom') || undefined;
    const updatedAtTo = searchParams.get('updatedAtTo') || undefined;

    const where: Prisma.AcraEntityWhereInput = {};
    const and: Prisma.AcraEntityWhereInput[] = [];

    if (search) {
      and.push({
        OR: [
          { entityName: { contains: search, mode: 'insensitive' } },
          { uen: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    for (const field of TEXT_FILTER_FIELDS) {
      const value = searchParams.get(field)?.trim();
      if (!value) continue;
      and.push({ [field]: { contains: value, mode: 'insensitive' } } as Prisma.AcraEntityWhereInput);
    }

    for (const field of STRING_DATE_FIELDS) {
      const from = searchParams.get(`${field}From`) || undefined;
      const to = searchParams.get(`${field}To`) || undefined;
      if (!from && !to) continue;
      const range: Prisma.StringFilter = {};
      if (from) range.gte = from;
      if (to) range.lte = to;
      and.push({ [field]: range } as Prisma.AcraEntityWhereInput);
    }

    // data_as_of is stored as an ISO string with a fixed +08:00 offset, so a
    // lexicographic range over the full timestamp covers the selected days.
    const dataAsOfFrom = searchParams.get('dataAsOfFrom') || undefined;
    const dataAsOfTo = searchParams.get('dataAsOfTo') || undefined;
    if (dataAsOfFrom || dataAsOfTo) {
      const range: Prisma.StringFilter = {};
      if (dataAsOfFrom) range.gte = `${dataAsOfFrom}T00:00:00+08:00`;
      if (dataAsOfTo) range.lte = `${dataAsOfTo}T23:59:59+08:00`;
      and.push({ dataAsOf: range });
    }
    addDayRange(and, 'createdAt', createdAtFrom, createdAtTo);
    addDayRange(and, 'updatedAt', updatedAtFrom, updatedAtTo);

    if (and.length > 0) {
      where.AND = and;
    }

    const [records, total, syncStateRow] = await Promise.all([
      prisma.acraEntity.findMany({
        where,
        select: {
          id: true,
          uen: true,
          entityName: true,
          entityStatus: true,
          entityType: true,
          companyTypeDescription: true,
          registrationIncorporateDate: true,
          block: true,
          streetName: true,
          levelNo: true,
          unitNo: true,
          buildingName: true,
          postalCode: true,
          address: true,
          accountDueDate: true,
          annualReturnDate: true,
          primarySsicCode: true,
          primarySsicDescription: true,
          secondarySsicCode: true,
          secondarySsicDescription: true,
          noOfOfficers: true,
          formerEntityName1: true,
          uenOfAuditFirm1: true,
          dataAsOf: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.acraEntity.count({ where }),
      prisma.acraSyncState.findUnique({ where: { id: 'main' } }),
    ]);

    return NextResponse.json({
      records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      syncState: syncStateRow
        ? {
            collectionLastUpdatedAt: syncStateRow.collectionLastUpdatedAt,
            entityCount: syncStateRow.entityCount,
            lastStartedAt: syncStateRow.lastStartedAt,
            lastCompletedAt: syncStateRow.lastCompletedAt,
            lastError: syncStateRow.lastError,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
