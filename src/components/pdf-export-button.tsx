
import React from 'react';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

interface PdfExportButtonProps {
    data: any[];
    headers: string[];
    fileName?: string;
    title?: string;
    disabled?: boolean;
}

export function PdfExportButton({ data, headers, fileName = 'report', title = 'Production Report', disabled }: PdfExportButtonProps) {
    const handleExport = () => {
        const doc = new jsPDF({ orientation: 'landscape' });

        const tableData = data.map(row => {
            return headers.map(header => {
                const val = row[header];
                if (val instanceof Date) {
                    return format(val, 'dd/MM/yyyy');
                }
                return val?.toString() || '';
            });
        });

        doc.setFontSize(18);
        doc.text(title, 14, 22);

        doc.setFontSize(11);
        doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);

        autoTable(doc, {
            head: [headers],
            body: tableData,
            startY: 35,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [41, 128, 185] },
        });

        doc.save(`${fileName}.pdf`);
    };

    return (
        <Button variant="outline" size="sm" onClick={handleExport} disabled={disabled} title="Export as PDF" className="justify-center h-9">
            <FileDown className="mr-2 h-3.5 w-3.5 text-red-600" />
            PDF
        </Button>
    );
}
