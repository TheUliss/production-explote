
import React from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from 'date-fns';

export interface AuditLogEntry {
    id: string;
    action: string;
    details: string;
    timestamp: Date;
    user?: string;
}

interface AuditLogProps {
    logs: AuditLogEntry[];
}

export function AuditLog({ logs }: AuditLogProps) {
    if (logs.length === 0) {
        return <div className="text-xs text-muted-foreground italic text-center py-4">No activity recorded.</div>;
    }

    return (
        <ScrollArea className="h-[200px] w-full rounded-md border p-2 bg-muted/10">
            <div className="space-y-2">
                {logs.slice().reverse().map((log) => (
                    <div key={log.id} className="flex flex-col text-[10px] border-b pb-1 last:border-0">
                        <div className="flex justify-between items-center text-muted-foreground">
                            <span className="font-semibold text-primary">{log.action}</span>
                            <span>{format(log.timestamp, 'HH:mm:ss')}</span>
                        </div>
                        <span className="truncate">{log.details}</span>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );
}
