'use client';

import * as xlsx from 'xlsx';
import { addDays, startOfToday } from 'date-fns';

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
  originalData: any[];
  includeSummary?: boolean;
  packedSerials?: Set<string>;
}

export function downloadReport({
  summaryData,
  summaryHeaders,
  selectedRowIndices,
  allFilteredData,
  originalData,
  includeSummary = true,
  packedSerials,
}: DownloadReportParams): { failedJobs: string[] } {
  const wb = xlsx.utils.book_new();
  const failedJobs: string[] = [];
  const sheetNames = new Set<string>();

  // 1. Add summary sheet (Filtered Data)
  if (includeSummary && summaryData.length > 0) {
    const summaryWs = xlsx.utils.json_to_sheet(summaryData, { header: summaryHeaders });
    const summarySheetName = "Filtered Data";
    xlsx.utils.book_append_sheet(wb, summaryWs, summarySheetName);
    sheetNames.add(summarySheetName);
  }

  // 2. Add extra summary sheets based on the original data
  if (includeSummary && originalData) {
    const today = startOfToday();
    const sevenDaysFromNow = addDays(today, 7);

    // Helper to project data based on summaryHeaders
    const projectData = (data: any[]) => {
      return data.map(row => {
        const newRow: any = {};
        summaryHeaders.forEach(header => {
          newRow[header] = row[header];
        });
        return newRow;
      });
    };

    // Summary 1: Upcoming Jobs (Next 7 Days)
    const upcomingJobs = originalData
      .filter(row => {
        const scheduleDate = row['Schedule Date'];
        return scheduleDate instanceof Date && scheduleDate >= today && scheduleDate <= sevenDaysFromNow;
      })
      .sort((a, b) => a['Schedule Date'].getTime() - b['Schedule Date'].getTime());

    if (upcomingJobs.length > 0) {
      const ws = xlsx.utils.json_to_sheet(projectData(upcomingJobs), { header: summaryHeaders });
      const sheetName = sanitizeSheetName('Upcoming Jobs (7 Days)', sheetNames);
      xlsx.utils.book_append_sheet(wb, ws, sheetName);
      sheetNames.add(sheetName);
    }

    // Summary 2: Overdue Jobs
    const overdueJobs = originalData
      .filter(row => {
        const scheduleDate = row['Schedule Date'];
        return scheduleDate instanceof Date && scheduleDate < today;
      })
      .sort((a, b) => a['Schedule Date'].getTime() - b['Schedule Date'].getTime());

    if (overdueJobs.length > 0) {
      const ws = xlsx.utils.json_to_sheet(projectData(overdueJobs), { header: summaryHeaders });
      const sheetName = sanitizeSheetName('Overdue Jobs', sheetNames);
      xlsx.utils.book_append_sheet(wb, ws, sheetName);
      sheetNames.add(sheetName);
    }

    // Summary 3: Group & Customer Summary
    const groupSummary = originalData.reduce((acc, row) => {
      const group = row['Schedule Group']?.toString() || 'N/A';
      const customer = row['Customer']?.toString() || 'N/A';
      const key = `${group}|${customer}`;

      if (!acc[key]) {
        acc[key] = {
          'Schedule Group': group,
          'Customer': customer,
          'Total Jobs': 0,
          'Total Qty Ordered': 0,
          'Overdue Jobs': 0,
          'Jobs Due (Next 7 Days)': 0,
        };
      }

      acc[key]['Total Jobs'] += 1;
      acc[key]['Total Qty Ordered'] += parseInt(row['Qty Ordered'], 10) || 0;

      const scheduleDate = row['Schedule Date'];
      if (scheduleDate instanceof Date) {
        if (scheduleDate < today) {
          acc[key]['Overdue Jobs'] += 1;
        }
        if (scheduleDate >= today && scheduleDate <= sevenDaysFromNow) {
          acc[key]['Jobs Due (Next 7 Days)'] += 1;
        }
      }

      return acc;
    }, {} as Record<string, any>);

    const groupSummaryArray = Object.values(groupSummary);
    if (groupSummaryArray.length > 0) {
      const ws = xlsx.utils.json_to_sheet(groupSummaryArray);
      const sheetName = sanitizeSheetName('Group & Customer Summary', sheetNames);
      xlsx.utils.book_append_sheet(wb, ws, sheetName);
      sheetNames.add(sheetName);
    }
  }


  // 3. Add serials sheets if rows are selected
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
        const status = packedSerials?.has(serial) ? 'Packed' : '';
        serials.push([serial, status]);
      }

      const dataForSheet = [
        ['Job Number', jobNumber],
        ['Schedule Date', formattedDate],
        [], // Empty row
        ['Seriales', 'Status'],
        ...serials
      ];

      const ws = xlsx.utils.aoa_to_sheet(dataForSheet);

      const colWidths = dataForSheet.reduce((acc: { wch: number }[], r) => {
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

  // 4. Download the workbook if it has any sheets
  if (wb.SheetNames.length > 0) {
    const fileName = `report_${new Date().toISOString().split('T')[0]}.xlsx`;
    xlsx.writeFile(wb, fileName);
  }

  return { failedJobs };
}
