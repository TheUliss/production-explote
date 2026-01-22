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

async function getExcelDataSummary(input: GenerateAISummaryInput): Promise<string> {
  const { excelData, selectedColumns, dateFilter, dateColumn, constantFilters } = input;

  const buffer = Buffer.from(excelData, 'base64');
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  let jsonData: any[] = xlsx.utils.sheet_to_json(worksheet);

  if (jsonData.length === 0) {
    return 'The Excel file has no data.';
  }

  // Apply constant filters
  if (constantFilters) {
    for (const column in constantFilters) {
      if (Object.prototype.hasOwnProperty.call(constantFilters, column) && constantFilters[column]) {
        const filterValues = constantFilters[column].split(',').map(v => v.trim().toLowerCase());
        if (filterValues.length > 0) {
          jsonData = jsonData.filter(row => {
            const rowValue = row[column]?.toString().toLowerCase() || '';
            return filterValues.includes(rowValue);
          });
        }
      }
    }
  }

  // Apply date filters
  if (dateFilter && dateFilter !== 'all' && dateColumn) {
    const today = startOfToday();

    jsonData = jsonData.filter(row => {
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

  // Sort data
  if (dateColumn) {
    jsonData.sort((a, b) => {
      const dateA = a[dateColumn];
      const dateB = b[dateColumn];
      if (dateA instanceof Date && dateB instanceof Date) {
        return dateA.getTime() - dateB.getTime();
      }
      return 0;
    });
  }

  // Select columns for the final output
  const processedData = jsonData.map(row => {
    const newRow: Record<string, any> = {};
    selectedColumns.forEach(col => {
      newRow[col] = row[col];
    });
    return newRow;
  });

  if (processedData.length === 0) {
    return "No data matches the specified filters.";
  }
  
  // Convert to Markdown table
  const headers = selectedColumns;
  let markdownTable = `| ${headers.join(' | ')} |\n`;
  markdownTable += `| ${headers.map(() => '---').join(' | ')} |\n`;
  processedData.forEach(row => {
    const rowValues = headers.map(header => {
      const value = row[header];
      if (value instanceof Date) {
        return value.toLocaleDateString();
      }
      return value !== undefined && value !== null ? String(value) : '';
    });
    markdownTable += `| ${rowValues.join(' | ')} |\n`;
  });

  return markdownTable;
}


const summarizeMarkdownPrompt = ai.definePrompt({
  name: 'summarizeMarkdownPrompt',
  input: { schema: z.object({ markdownTable: z.string() }) },
  output: { schema: GenerateAISummaryOutputSchema },
  prompt: `You are an AI assistant tasked with summarizing data from Excel files.
Based on the provided markdown table, generate a concise, natural language summary. Highlight key insights, totals, and important trends. Do not just repeat the table data.

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
    const markdownTable = await getExcelDataSummary(input);

    if (markdownTable === 'The Excel file has no data.' || markdownTable === "No data matches the specified filters.") {
      return { summary: markdownTable };
    }

    const {output} = await summarizeMarkdownPrompt({ markdownTable });
    return {summary: output!.summary};
  }
);

export async function generateAISummary(input: GenerateAISummaryInput): Promise<GenerateAISummaryOutput> {
  return generateAISummaryFlow(input);
}
