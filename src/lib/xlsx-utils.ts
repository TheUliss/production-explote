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
