'use client';

import * as React from 'react';
import * as xlsx from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { generateSummaryAction } from '@/app/actions';

import AppHeader from '@/components/app-header';
import { FileUpload } from '@/components/file-upload';
import { ConfigPanel } from '@/components/config-panel';
import { SummaryDisplay } from '@/components/summary-display';

export type ConstantFilter = { id: string; column: string; value: string };

export default function ExcelInsightsPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [fileData, setFileData] = React.useState<any[] | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [fileKey, setFileKey] = React.useState(0);

  const [selectedColumns, setSelectedColumns] = React.useState<string[]>([]);
  const [dateFilter, setDateFilter] = React.useState<string>('all');
  const [dateColumn, setDateColumn] = React.useState<string>('');
  const [constantFilters, setConstantFilters] = React.useState<ConstantFilter[]>([]);

  const [summary, setSummary] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const { toast } = useToast();

  const resetState = () => {
    setFile(null);
    setFileData(null);
    setHeaders([]);
    setSelectedColumns([]);
    setDateFilter('all');
    setDateColumn('');
    setConstantFilters([]);
    setSummary(null);
    setIsLoading(false);
    setFileKey(prev => prev + 1);
  };

  const handleFile = (uploadedFile: File) => {
    if (!uploadedFile) return;

    resetState();
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = xlsx.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (Array.isArray(json) && json.length > 1) {
          const fileHeaders = json[0] as string[];
          const fileRows = json.slice(1);

          setHeaders(fileHeaders);
          setFileData(fileRows);
          setSelectedColumns(fileHeaders); // Select all by default
        } else {
            throw new Error('No data found in the Excel sheet.');
        }
      } catch (error) {
        console.error(error);
        toast({
          variant: 'destructive',
          title: 'Error reading file',
          description: error instanceof Error ? error.message : 'Could not process the Excel file. Please ensure it is valid.',
        });
        resetState();
      }
    };
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'File Reading Error',
        description: 'An error occurred while reading the file.',
      });
      resetState();
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const getFileAsBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject('No file selected');
        return;
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleGenerateSummary = async () => {
    if (!fileData) {
      toast({ variant: 'destructive', title: 'No file data available' });
      return;
    }
    if(selectedColumns.length === 0) {
        toast({ variant: 'destructive', title: 'No columns selected', description: 'Please select at least one column to summarize.' });
        return;
    }
    if(dateFilter !== 'all' && !dateColumn) {
        toast({ variant: 'destructive', title: 'Date column not selected', description: 'Please select a column containing dates to apply a date filter.' });
        return;
    }

    setIsLoading(true);
    setSummary(null);

    try {
      const base64Data = await getFileAsBase64();
      const constantFilterObject = constantFilters.reduce((acc, filter) => {
        if(filter.column && filter.value) {
            acc[filter.column] = filter.value;
        }
        return acc;
      }, {} as Record<string, string>);
      
      const result = await generateSummaryAction({
        excelData: base64Data,
        selectedColumns,
        dateFilter: dateFilter,
        dateColumn: dateColumn,
        constantFilters: constantFilterObject,
      });

      if (result.error) {
        throw new Error(result.error);
      }
      setSummary(result.summary ?? 'No summary was generated.');
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Summary Generation Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader />
      <main className="flex-1 container mx-auto px-4 md:px-6 py-8">
        {!fileData ? (
          <FileUpload onFileSelect={handleFile} key={fileKey} />
        ) : (
          <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 xl:col-span-3">
              <ConfigPanel
                fileName={file?.name ?? 'Unknown file'}
                headers={headers}
                selectedColumns={selectedColumns}
                setSelectedColumns={setSelectedColumns}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                dateColumn={dateColumn}
                setDateColumn={setDateColumn}
                constantFilters={constantFilters}
                setConstantFilters={setConstantFilters}
                onGenerate={handleGenerateSummary}
                onClear={resetState}
                isLoading={isLoading}
              />
            </div>
            <div className="lg:col-span-8 xl:col-span-9">
              <SummaryDisplay summary={summary} isLoading={isLoading} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
