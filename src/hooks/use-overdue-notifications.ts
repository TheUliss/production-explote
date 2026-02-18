'use client';

import * as React from 'react';
import type { ProductionRow } from '@/lib/types';
import { startOfToday } from 'date-fns';

const SESSION_KEY = 'prod-overdue-notified';

/**
 * Requests browser notification permission and fires a native OS notification
 * when there are overdue jobs. Only notifies once per browser session.
 */
export function useOverdueNotifications(data: ProductionRow[] | null) {
    React.useEffect(() => {
        if (!data || data.length === 0) return;
        if (typeof window === 'undefined') return;
        if (!('Notification' in window)) return;

        // Only notify once per session
        if (sessionStorage.getItem(SESSION_KEY)) return;

        const today = startOfToday();
        const overdueCount = data.filter(row => {
            const d = row['Schedule Date'];
            return d instanceof Date && d < today;
        }).length;

        if (overdueCount === 0) return;

        const fire = () => {
            sessionStorage.setItem(SESSION_KEY, '1');
            new Notification('⚠️ Jobs Vencidos — Producción', {
                body: `Hay ${overdueCount} job${overdueCount > 1 ? 's' : ''} vencido${overdueCount > 1 ? 's' : ''} en el reporte actual.`,
                icon: '/favicon.ico',
                tag: 'overdue-jobs',
            });
        };

        if (Notification.permission === 'granted') {
            fire();
        } else if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') fire();
            });
        }
        // If 'denied', silently skip
    }, [data]);
}
