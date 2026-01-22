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

const GenerateAISummaryInputSchema = z.object({
  excelData: z
    .string()
    .describe(
      'Excel file data as a base64 encoded string.'
    ),
  selectedColumns: z
    .array(z.string())
    .describe('Array of column names to include in the summary.'),
  dateRange: z
    .object({
      startDate: z.string().optional().describe('Start date for filtering (ISO format).'),
      endDate: z.string().optional().describe('End date for filtering (ISO format).'),
    })
    .optional()
    .describe('Date range for filtering.'),
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

const excelDataTool = ai.defineTool({
  name: 'getExcelDataSummary',
  description: 'This tool analyzes excel data, filters it based on column selection, date ranges, and constant value, and returns a concise summary of the data.',
  inputSchema: GenerateAISummaryInputSchema,
  outputSchema: z.string(),
},
async (input) => {
  // TODO: Implement excel data parsing and filtering here.
  // For now, return a placeholder string
  return `AI summary of excel data based on user-defined filters.`
});

const generateAISummaryPrompt = ai.definePrompt({
  name: 'generateAISummaryPrompt',
  tools: [excelDataTool],
  input: {schema: GenerateAISummaryInputSchema},
  output: {schema: GenerateAISummaryOutputSchema},
  prompt: `You are an AI assistant tasked with summarizing data from Excel files.

The user will provide an Excel file, select specific columns, define filters such as date ranges and constant values.

Use the "getExcelDataSummary" tool to get the summary of the excel data with the selected columns, data range and constant filters.

Use the tool, then present the results to the user in a comprehensive manner.`,
});

const generateAISummaryFlow = ai.defineFlow(
  {
    name: 'generateAISummaryFlow',
    inputSchema: GenerateAISummaryInputSchema,
    outputSchema: GenerateAISummaryOutputSchema,
  },
  async input => {
    const {output} = await generateAISummaryPrompt(input);
    return {summary: output!.summary};
  }
);

export async function generateAISummary(input: GenerateAISummaryInput): Promise<GenerateAISummaryOutput> {
  return generateAISummaryFlow(input);
}
