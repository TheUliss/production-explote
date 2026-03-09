/**
 * Shared types for production-explote
 */

// ── Data Row ──────────────────────────────────────────────────────────────────

/** Represents a single row from the production Excel report. */
export interface ProductionRow {
    'Job Number': string;
    'Schedule Date': Date;
    'Qty Ordered': string | number;
    'Schedule Group'?: string;
    'Item Description'?: string;
    'Customer'?: string;
    /** Allow any extra columns from the Excel file */
    [key: string]: unknown;
}

// ── Shift / Turno ─────────────────────────────────────────────────────────────

/**
 * Production shift definitions:
 *
 *  N1 — Mon–Thu  07:00–19:00
 *  N3 — Mon–Thu  19:00–07:00 (next day)
 *  N2 — Fri–Sun  07:00–19:00
 *  N4 — Fri–Sun  19:00–07:00 (next day)
 */
export type ShiftId = 'N1' | 'N2' | 'N3' | 'N4' | 'all';

export interface ShiftDefinition {
    id: ShiftId;
    label: string;
    /** Day-of-week range (0=Sun … 6=Sat). Inclusive. */
    days: number[];
    /** Start hour (24h). */
    startHour: number;
    /** End hour (24h). If < startHour the shift crosses midnight. */
    endHour: number;
}

export const SHIFTS: ShiftDefinition[] = [
    { id: 'N1', label: 'N1 — Lun–Jue 07:00–19:00', days: [1, 2, 3, 4], startHour: 7, endHour: 19 },
    { id: 'N3', label: 'N3 — Lun–Jue 19:00–07:00', days: [1, 2, 3, 4], startHour: 19, endHour: 7 },
    { id: 'N2', label: 'N2 — Vie–Dom 07:00–19:00', days: [5, 6, 0], startHour: 7, endHour: 19 },
    { id: 'N4', label: 'N4 — Vie–Dom 19:00–07:00', days: [5, 6, 0], startHour: 19, endHour: 7 },
];

/**
 * Returns the shift that is currently active based on the given Date.
 * Returns null if no shift matches (shouldn't happen in practice).
 */
/**
 * Returns the shift that is currently active based on the given Date.
 */
export function getShiftForDate(date: Date): ShiftId | null {
    const day = date.getDay();   // 0=Sun … 6=Sat
    const hour = date.getHours();

    for (const shift of SHIFTS) {
        const crossesMidnight = shift.endHour < shift.startHour;

        if (crossesMidnight) {
            // Night Shift Logic
            // 1. Started today? (e.g., Fri 20:00 is N4)
            if (shift.days.includes(day) && hour >= shift.startHour) {
                return shift.id;
            }
            // 2. Started yesterday? (e.g., Mon 04:00 is N4 because Sun is N4)
            // If hour < endHour (e.g. 4 < 7), check if *yesterday* was a shift day.
            if (hour < shift.endHour) {
                const prevDay = (day === 0) ? 6 : day - 1;
                if (shift.days.includes(prevDay)) {
                    return shift.id;
                }
            }
        } else {
            // Day Shift Logic (Standard)
            if (shift.days.includes(day) && hour >= shift.startHour && hour < shift.endHour) {
                return shift.id;
            }
        }
    }
    return null;
}

export const getCurrentShift = (now: Date = new Date()) => getShiftForDate(now) || 'all';
