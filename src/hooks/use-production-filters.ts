import * as React from 'react';
import { addDays, startOfToday } from 'date-fns';
import type { ProductionRow } from '@/lib/types';

export interface ProductionFilterStats {
    overdueRows: ProductionRow[];
    dueSoon3Rows: ProductionRow[];
    dueSoon7Rows: ProductionRow[];
    onTimeRows: ProductionRow[];
    overdueCount: number;
    dueSoon3Count: number;
    dueSoon7Count: number;
    onTimeCount: number;
}

/**
 * Centralises the overdue / due-soon classification logic that was previously
 * duplicated across `excel-insights-page.tsx` and `data-table.tsx`.
 */
export function useProductionFilters(data: ProductionRow[] | null): ProductionFilterStats {
    return React.useMemo(() => {
        const empty: ProductionFilterStats = {
            overdueRows: [],
            dueSoon3Rows: [],
            dueSoon7Rows: [],
            onTimeRows: [],
            overdueCount: 0,
            dueSoon3Count: 0,
            dueSoon7Count: 0,
            onTimeCount: 0,
        };

        if (!data || data.length === 0) return empty;

        const today = startOfToday();
        const d3 = addDays(today, 3);
        const d7 = addDays(today, 7);

        const overdueRows: ProductionRow[] = [];
        const dueSoon3Rows: ProductionRow[] = [];
        const dueSoon7Rows: ProductionRow[] = [];
        const onTimeRows: ProductionRow[] = [];

        for (const row of data) {
            const date = row['Schedule Date'];
            if (!(date instanceof Date)) {
                onTimeRows.push(row);
                continue;
            }
            if (date < today) overdueRows.push(row);
            else if (date <= d3) dueSoon3Rows.push(row);
            else if (date <= d7) dueSoon7Rows.push(row);
            else onTimeRows.push(row);
        }

        return {
            overdueRows,
            dueSoon3Rows,
            dueSoon7Rows,
            onTimeRows,
            overdueCount: overdueRows.length,
            dueSoon3Count: dueSoon3Rows.length,
            dueSoon7Count: dueSoon7Rows.length,
            onTimeCount: onTimeRows.length,
        };
    }, [data]);
}
