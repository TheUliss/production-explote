'use client';

import * as xlsx from 'xlsx';

export function downloadDataAsXLSX(data: any[], headers: string[]) {
  // Create worksheet from json
  const ws = xlsx.utils.json_to_sheet(data, { header: headers });

  // Create a new workbook
  const wb = xlsx.utils.book_new();

  // Add the worksheet to the workbook
  xlsx.utils.book_append_sheet(wb, ws, "Filtered Data");

  // Generate a file name
  const fileName = `excel_filtered_data_${new Date().toISOString().split('T')[0]}.xlsx`;

  // Write the workbook and trigger a download
  xlsx.writeFile(wb, fileName);
}


export function downloadSerialsAsXLSX(row: any): boolean {
    const jobNumber = row['Job Number']?.toString() || 'UNKNOWN_JOB';
    const scheduleDate = row['Schedule Date'];
    const qtyOrdered = parseInt(row['Qty Ordered'], 10);

    if (!jobNumber || !(scheduleDate instanceof Date) || isNaN(qtyOrdered) || qtyOrdered <= 0) {
        console.error("Invalid data for serial generation", { row });
        return false;
    }
    
    const formattedDate = scheduleDate.toLocaleDateString();

    const serials = [];
    for (let i = 1; i <= qtyOrdered; i++) {
        const serial = `${jobNumber}-01-${i.toString().padStart(2, '0')}`;
        serials.push([serial]);
    }

    const dataForSheet = [
        ['Job Number', jobNumber],
        ['Schedule Date', formattedDate],
        [], // Empty row
        ['Seriales'],
        ...serials
    ];

    const ws = xlsx.utils.aoa_to_sheet(dataForSheet);
    
    // Auto-fit columns
    const colWidths = dataForSheet.reduce((acc: {wch: number}[], r) => {
        r.forEach((c, i) => {
            const len = c?.toString().length ?? 0;
            if (!acc[i] || acc[i].wch < len) {
                acc[i] = { wch: len + 2 }; // Add a little padding
            }
        });
        return acc;
    }, []);

    ws['!cols'] = colWidths;

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Seriales');

    const fileName = `serials_${jobNumber}.xlsx`;
    xlsx.writeFile(wb, fileName);
    return true;
}
