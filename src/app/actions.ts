'use server';

import { generateAISummary, type GenerateAISummaryInput } from '@/ai/flows/generate-ai-summary';
import { z } from 'zod';

const inputSchema = z.object({
  excelData: z.string(),
  selectedColumns: z.array(z.string()),
  dateFilter: z.string().optional(),
  dateColumn: z.string().optional(),
  constantFilters: z.record(z.string(), z.string()).optional(),
});


export async function generateSummaryAction(input: GenerateAISummaryInput) {
  try {
    const validatedInput = inputSchema.parse(input);
    const result = await generateAISummary(validatedInput);
    return { summary: result.summary };
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return { error: `Invalid input: ${error.message}` };
    }
    return { error: 'Failed to generate summary. Please try again.' };
  }
}
