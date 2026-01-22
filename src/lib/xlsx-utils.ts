'use client';

import * as xlsx from 'xlsx';

function sanitizeSheetName(name: string, existingNames: Set<string>): string {
  // Sheet names cannot be longer than 31 chars and cannot contain: \ / ? * [ ]
  let sanitized = name.replace(/[\\/?*[\]]/g, "_");
  if (sanitized.startsWith("'")) {
    sanitized = sanitized.substring(1);
  }
  if (sanitized.endsWith("'")) {
    sanitized = sanitized.slice(0, -1);
  }

  let finalName = sanitized.substring(0, 31);
  let counter = 1;
  // If name already exists, append a number
  while (existingNames.has(finalName)) {
    const suffix = `_(${counter})`;
    finalName = sanitized.substring(0, 31 - suffix.length) + suffix;
    counter++;
  }
  return finalName;
}

interface DownloadReportParams {
  summaryData: any[];
  summaryHeaders: string[];
  selectedRowIndices: number[];
  allFilteredData: any[];
  includeSummary?: boolean;
}

export function downloadReport({
  summaryData,
  summaryHeaders,
  selectedRowIndices,
  allFilteredData,
  includeSummary = true,
}: DownloadReportParams): { failedJobs: string[] } {
  const wb = xlsx.utils.book_new();
  const failedJobs: string[] = [];
  const sheetNames = new Set<string>();

  // 1. Add summary sheet (Filtered Data)
  if (includeSummary) {
    const summaryWs = xlsx.utils.json_to_sheet(summaryData, { header: summaryHeaders });
    const summarySheetName = "Filtered Data";
    xlsx.utils.book_append_sheet(wb, summaryWs, summarySheetName);
    sheetNames.add(summarySheetName);
  }

  // 2. Add serials sheets if rows are selected
  if (selectedRowIndices.length > 0) {
    const rowsToProcess = selectedRowIndices.map(index => allFilteredData[index]);
    
    rowsToProcess.forEach((row, index) => {
        const jobNumber = row['Job Number']?.toString() || `UNKNOWN_JOB_${index}`;
        const scheduleDate = row['Schedule Date'];
        const qtyOrdered = parseInt(row['Qty Ordered'], 10);

        if (!jobNumber || !(scheduleDate instanceof Date) || isNaN(qtyOrdered) || qtyOrdered <= 0) {
            console.error("Invalid data for serial generation", { row });
            failedJobs.push(jobNumber);
            return; // skip this row
        }
        
        const formattedDate = scheduleDate.toLocaleDateString();
        const padLength = Math.max(3, String(qtyOrdered).length);

        const serials = [];
        for (let i = 1; i <= qtyOrdered; i++) {
            const serial = `${jobNumber}-01-${i.toString().padStart(padLength, '0')}`;
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

        const uniqueSheetName = sanitizeSheetName(jobNumber, sheetNames);
        sheetNames.add(uniqueSheetName);
        
        xlsx.utils.book_append_sheet(wb, ws, uniqueSheetName);
    });
  }

  // 3. Download the workbook
  const fileName = `report_${new Date().toISOString().split('T')[0]}.xlsx`;
  xlsx.writeFile(wb, fileName);
  
  return { failedJobs };
}
