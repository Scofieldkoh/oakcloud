import { z } from 'zod';

const UUID = z.string().uuid();
const DEADLINE_COLUMN_IDS = ['dueDate', 'timing', 'company', 'familyService', 'milestone', 'type', 'status', 'cycleOrigin', 'actions'] as const;

export const deadlineViewPreferenceSchema = z.object({
  version: z.literal(1),
  defaultView: z.enum(['TABLE', 'CALENDAR']),
  monthCount: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  visibleTypes: z.array(z.enum(['STATUTORY', 'CLIENT', 'INTERNAL'])).max(3),
  familyIds: z.array(UUID).max(50),
  tableColumnWidths: z.record(z.string(), z.number().finite().min(96).max(800)).default({}),
  tableColumnOrder: z.array(z.string()).max(20).default([]),
  tableColumnVisibility: z.record(z.string(), z.boolean()).default({}),
  sortBy: z.enum(['dueDate', 'company', 'family', 'service', 'type', 'status']).default('dueDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).default(20),
});

export type DeadlineViewPreference = z.infer<typeof deadlineViewPreferenceSchema>;

export const defaultDeadlineViewPreference: DeadlineViewPreference = {
  version: 1,
  defaultView: 'TABLE',
  monthCount: null,
  visibleTypes: ['STATUTORY', 'CLIENT', 'INTERNAL'],
  familyIds: [],
  tableColumnWidths: {},
  tableColumnOrder: [],
  tableColumnVisibility: {},
  sortBy: 'dueDate',
  sortOrder: 'asc',
  pageSize: 20,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
/** Parse versioned preferences without allowing malformed JSON to affect queries. */
export function parseDeadlineViewPreference(value: unknown): DeadlineViewPreference {
  if (!isRecord(value) || value.version !== 1) return defaultDeadlineViewPreference;

  const rawWidths = isRecord(value.tableColumnWidths) ? value.tableColumnWidths : {};
  const rawOrder = Array.isArray(value.tableColumnOrder) ? value.tableColumnOrder : [];
  const rawVisibility = isRecord(value.tableColumnVisibility) ? value.tableColumnVisibility : {};
  const parsed = deadlineViewPreferenceSchema.safeParse({
    ...value,
    tableColumnWidths: {},
    tableColumnOrder: [],
    tableColumnVisibility: {},
    sortBy: value.sortBy ?? 'dueDate',
    sortOrder: value.sortOrder ?? 'asc',
    pageSize: value.pageSize ?? 20,
  });
  if (!parsed.success) return defaultDeadlineViewPreference;

  const widths = Object.fromEntries(
    DEADLINE_COLUMN_IDS
      .filter((column) => typeof rawWidths[column] === 'number' && Number.isFinite(rawWidths[column]))
      .map((column) => [column, Math.min(800, Math.max(96, Math.round(rawWidths[column] as number)))]),
  );
  const knownOrder = rawOrder.filter((column): column is (typeof DEADLINE_COLUMN_IDS)[number] => typeof column === 'string' && DEADLINE_COLUMN_IDS.includes(column as (typeof DEADLINE_COLUMN_IDS)[number]));
  const tableColumnOrder = [...new Set([...knownOrder, ...DEADLINE_COLUMN_IDS])];
  const tableColumnVisibility = Object.fromEntries(DEADLINE_COLUMN_IDS.map((column) => [column, column === 'actions' ? true : rawVisibility[column] !== false]));
  return {
    ...defaultDeadlineViewPreference,
    ...parsed.data,
    visibleTypes: parsed.data.visibleTypes.length > 0 ? parsed.data.visibleTypes : defaultDeadlineViewPreference.visibleTypes,
    tableColumnWidths: widths,
    tableColumnOrder,
    tableColumnVisibility,
  };
}
