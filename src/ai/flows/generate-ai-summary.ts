'use server';

/**
 * @fileOverview A flow that generates a summary of data from an Excel file based on user-defined filters.
 *
 * - generateAISummary - A function that initiates the AI summary generation process.
 * - GenerateAISummaryInput - The input type for the generateAISummary function.
 * - GenerateAISummaryOutput - The return type for the generateAISummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import * as xlsx from 'xlsx';
import { addDays, endOfMonth, startOfMonth, startOfToday, isValid } from 'date-fns';

const GenerateAISummaryInputSchema = z.object({
  excelData: z
    .string()
    .describe(
      'Excel file data as a base64 encoded string.'
    ),
  selectedColumns: z
    .array(z.string())
    .describe('Array of column names to include in the summary.'),
  dateFilter: z.string().optional().describe("Filter for dates: 'all', 'overdue', 'due-soon-7', 'current-month'."),
  dateColumn: z.string().optional().describe("The column that contains dates for filtering."),
  constantFilters: z
    .record(z.string(), z.string())
    .optional()
    .describe('Key-value pairs for filtering based on constant values.'),
});

export type GenerateAISummaryInput = z.infer<typeof GenerateAISummaryInputSchema>;

const GenerateAISummaryOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the filtered Excel data.'),
});

export type GenerateAISummaryOutput = z.infer<typeof GenerateAISummaryOutputSchema>;

async function getExcelDataSummary(input: GenerateAISummaryInput): Promise<{ data: string, rowCount: number }> {
  const { excelData, selectedColumns, dateFilter, dateColumn, constantFilters } = input;

  const buffer = Buffer.from(excelData, 'base64');
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  let filteredData: any[] = xlsx.utils.sheet_to_json(worksheet);

  if (filteredData.length === 0) {
    return { data: 'The Excel file has no data.', rowCount: 0 };
  }

  // First, filter rows based on the constant values provided.
  // This removes any rows that do not match the filter criteria.
  if (constantFilters) {
    for (const column in constantFilters) {
      if (Object.prototype.hasOwnProperty.call(constantFilters, column) && constantFilters[column]) {
        const filterValues = constantFilters[column]
          .split(',')
          .map(v => v.trim().toLowerCase())
          .filter(Boolean); // Remove empty strings from filter values

        if (filterValues.length > 0) {
          filteredData = filteredData.filter(row => {
            const rowValue = row[column]?.toString().toLowerCase() || '';
            return filterValues.includes(rowValue);
          });
        }
      }
    }
  }

  // Then, apply date filters to the already filtered data.
  if (dateFilter && dateFilter !== 'all' && dateColumn) {
    const today = startOfToday();

    filteredData = filteredData.filter(row => {
      const itemDate = row[dateColumn];
      if (!(itemDate instanceof Date) || !isValid(itemDate)) {
        return false;
      }

      switch (dateFilter) {
        case 'overdue':
          return itemDate < today;
        case 'due-soon-7':
          const aWeekFromNow = addDays(today, 7);
          return itemDate >= today && itemDate <= aWeekFromNow;
        case 'current-month':
          const monthStart = startOfMonth(today);
          const monthEnd = endOfMonth(today);
          return itemDate >= monthStart && itemDate <= monthEnd;
        default:
          return true;
      }
    });
  }

  // Sort the resulting data
  if (dateColumn) {
    filteredData.sort((a, b) => {
      const dateA = a[dateColumn];
      const dateB = b[dateColumn];
      if (dateA instanceof Date && dateB instanceof Date) {
        return dateA.getTime() - dateB.getTime();
      }
      return 0;
    });
  }

  // Second, from the filtered rows, select only the columns the user wants to include in the summary.
  const dataWithSelectedColumns = filteredData.map(row => {
    const newRow: Record<string, any> = {};
    selectedColumns.forEach(col => {
      newRow[col] = row[col];
    });
    return newRow;
  });

  if (dataWithSelectedColumns.length === 0) {
    return { data: "No data matches the specified filters.", rowCount: 0 };
  }
  
  // OPTIMIZATION: Limit rows sent to the AI to avoid exceeding size limits
  const MAX_ROWS = 100;
  const limitedData = dataWithSelectedColumns.slice(0, MAX_ROWS);
  const totalRows = dataWithSelectedColumns.length;
  
  // Convert the final data to a Markdown table
  const headers = selectedColumns;
  let markdownTable = `| ${headers.join(' | ')} |\n`;
  markdownTable += `| ${headers.map(() => '---').join(' | ')} |\n`;
  limitedData.forEach(row => {
    const rowValues = headers.map(header => {
      const value = row[header];
      if (value instanceof Date) {
        return value.toLocaleDateString();
      }
      return value !== undefined && value !== null ? String(value) : '';
    });
    markdownTable += `| ${rowValues.join(' | ')} |\n`;
  });

  // Add a note if more rows exist than are shown
  if (totalRows > MAX_ROWS) {
    markdownTable += `\n*Note: Showing first ${MAX_ROWS} of ${totalRows} total rows.*\n`;
  }

  return { data: markdownTable, rowCount: totalRows };
}


const summarizeMarkdownPrompt = ai.definePrompt({
  name: 'summarizeMarkdownPrompt',
  input: { schema: z.object({ 
    markdownTable: z.string(),
    totalRows: z.number()
  }) },
  output: { schema: GenerateAISummaryOutputSchema },
  prompt: `You are an AI assistant tasked with summarizing data from Excel files.
Based on the provided markdown table (showing up to 100 rows from a total of {{{totalRows}}} rows), generate a concise, natural language summary. Highlight key insights, totals, and important trends. Do not just repeat the table data.

If the sample is less than the total rows, acknowledge this and base your summary on the visible data while noting that the complete dataset contains {{{totalRows}}} rows.

Data:
{{{markdownTable}}}
`,
});

const generateAISummaryFlow = ai.defineFlow(
  {
    name: 'generateAISummaryFlow',
    inputSchema: GenerateAISummaryInputSchema,
    outputSchema: GenerateAISummaryOutputSchema,
  },
  async input => {
    const { data: markdownTable, rowCount } = await getExcelDataSummary(input);

    if (markdownTable === 'The Excel file has no data.' || markdownTable === "No data matches the specified filters.") {
      return { summary: markdownTable };
    }

    const {output} = await summarizeMarkdownPrompt({ 
      markdownTable,
      totalRows: rowCount
    });
    return {summary: output!.summary};
  }
);

export async function generateAISummary(input: GenerateAISummaryInput): Promise<GenerateAISummaryOutput> {
  return generateAISummaryFlow(input);
}
