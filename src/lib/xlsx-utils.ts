'use client';

import * as xlsx from 'xlsx';

export function downloadSummaryAsXLSX(summary: string) {
  // Create a new workbook
  const wb = xlsx.utils.book_new();

  // Create worksheet data
  const ws_data = [
    ["AI Generated Summary"],
    [summary]
  ];

  // Create a worksheet
  const ws = xlsx.utils.aoa_to_sheet(ws_data);

  // Set column widths and text wrapping
  ws['!cols'] = [{ wch: 100 }];
  if (ws['B2']) {
    ws['B2'].s = { alignment: { wrapText: true } };
  }


  // Add the worksheet to the workbook
  xlsx.utils.book_append_sheet(wb, ws, "Summary");

  // Generate a file name
  const fileName = `excel_summary_${new Date().toISOString()}.xlsx`;

  // Write the workbook and trigger a download
  xlsx.writeFile(wb, fileName);
}
