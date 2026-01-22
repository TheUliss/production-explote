'use client';

import * as React from 'react';
import * as xlsx from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { addDays, endOfMonth, startOfMonth, startOfToday, isValid } from 'date-fns';

import AppHeader from '@/components/app-header';
import { FileUpload } from '@/components/file-upload';
import { ConfigPanel } from '@/components/config-panel';
import { DataTable } from '@/components/data-table';


export type ConstantFilter = { id: string; column: string; value: string };

// Define the columns to always keep and their desired order.
const REQUIRED_COLUMNS = ["Schedule Date", "Schedule Group", "Job Number", "Item Description", "Qty Ordered", "Customer"];

export default function ExcelInsightsPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [fileData, setFileData] = React.useState<any[] | null>(null); // This will hold the pre-filtered and sorted data.
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [fileKey, setFileKey] = React.useState(0);
  const [filteredData, setFilteredData] = React.useState<any[] | null>(null);
  const [dataForSummaries, setDataForSummaries] = React.useState<any[] | null>(null);
  const [packedSerials, setPackedSerials] = React.useState<Set<string>>(new Set());

  // Persistent State
  const [selectedColumns, setSelectedColumns] = useLocalStorage<string[]>('excel-insights-selectedColumns', []);
  const [dateFilter, setDateFilter] = useLocalStorage<string>('excel-insights-dateFilter', 'all');
  const [dateColumn, setDateColumn] = useLocalStorage<string>('excel-insights-dateColumn', '');
  const [constantFilters, setConstantFilters] = useLocalStorage<ConstantFilter[]>('excel-insights-constantFilters', []);


  const { toast } = useToast();

  const resetFileUpload = () => {
    setFile(null);
    setFileData(null);
    setHeaders([]);
    setFilteredData(null);
    setDataForSummaries(null);
    setPackedSerials(new Set());
    setFileKey(prev => prev + 1);
  };

  const handleFile = (uploadedFile: File) => {
    if (!uploadedFile) return;

    resetFileUpload();
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = xlsx.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = xlsx.utils.sheet_to_json(worksheet);
        
        if (Array.isArray(json) && json.length > 0) {
          const originalHeaders = Object.keys(json[0] as object);

          // 1. Determine available columns based on REQUIRED_COLUMNS and their order.
          const availableHeaders = REQUIRED_COLUMNS.filter(h => originalHeaders.includes(h));
          
          if (availableHeaders.length === 0) {
             throw new Error("None of the required columns were found in the file. Required: " + REQUIRED_COLUMNS.join(', '));
          }

          // 2. Pre-filter and reorder columns for every row.
          let processedData = json.map(row => {
            const newRow: any = {};
            availableHeaders.forEach(header => {
              newRow[header] = row[header];
            });
            return newRow;
          });

          // 3. Sort data by "Schedule Date" ascending.
          if (availableHeaders.includes("Schedule Date")) {
            processedData.sort((a, b) => {
                const dateA = a["Schedule Date"];
                const dateB = b["Schedule Date"];
                if (dateA instanceof Date && isValid(dateA) && dateB instanceof Date && isValid(dateB)) {
                    return dateA.getTime() - dateB.getTime();
                }
                if (dateA) return -1;
                if (dateB) return 1;
                return 0;
            });
          }

          setHeaders(availableHeaders);
          setFileData(processedData);
          
          // Validate persisted states
          const validPersistedColumns = selectedColumns.filter(col => availableHeaders.includes(col));
          if (validPersistedColumns.length > 0) {
            setSelectedColumns(validPersistedColumns);
          } else {
            setSelectedColumns(availableHeaders); // Default to all available required columns
          }

          if (!availableHeaders.includes(dateColumn)) {
              setDateColumn(availableHeaders.includes("Schedule Date") ? "Schedule Date" : '');
          }

          setConstantFilters(prev => prev.filter(f => availableHeaders.includes(f.column) || f.column === ''));

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
        resetFileUpload();
      }
    };
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'File Reading Error',
        description: 'An error occurred while reading the file.',
      });
      resetFileUpload();
    };
    reader.readAsArrayBuffer(uploadedFile);
  };
  
  const handlePackingFile = (packingFile: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = xlsx.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            if (json.length < 2) { // must have header and at least one row
                throw new Error("Packing file is empty or has no data rows.");
            }

            const headers = json[0].map(h => h?.toString().trim());
            const serialsColIndex = headers.findIndex(h => h === 'Seriales');

            if (serialsColIndex === -1) {
                throw new Error('Could not find a "Seriales" column in the packing file.');
            }

            const loadedSerials = new Set<string>();
            // Start from 1 to skip header row
            for (let i = 1; i < json.length; i++) {
                const serial = json[i][serialsColIndex]?.toString().trim();
                if (serial) {
                    loadedSerials.add(serial);
                }
            }

            setPackedSerials(loadedSerials);

            toast({
                title: "Packing Data Loaded",
                description: `${loadedSerials.size} packed serials have been successfully loaded.`,
            });
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Error reading packing file',
                description: error instanceof Error ? error.message : 'Could not process the packing data file.',
            });
            setPackedSerials(new Set()); // Reset on error
        }
    };
    reader.onerror = () => {
        toast({
            variant: 'destructive',
            title: 'File Reading Error',
            description: 'An error occurred while reading the packing data file.',
        });
        setPackedSerials(new Set());
    };
    reader.readAsArrayBuffer(packingFile);
};


  React.useEffect(() => {
    if (!fileData) {
      setFilteredData(null);
      setDataForSummaries(null);
      return;
    }

    let dataAfterConstantFilters = [...fileData];

    // Constant filters
    const constantFilterObject = constantFilters.reduce((acc, filter) => {
        if (filter.column && filter.value) {
          if (acc[filter.column]) {
            acc[filter.column] += `,${filter.value}`;
          } else {
            acc[filter.column] = filter.value;
          }
        }
        return acc;
    }, {} as Record<string, string>);

    for (const column in constantFilterObject) {
        if (Object.prototype.hasOwnProperty.call(constantFilterObject, column) && constantFilterObject[column]) {
            const filterValues = constantFilterObject[column]
                .split(',')
                .map(v => v.trim().toLowerCase())
                .filter(Boolean);

            if (filterValues.length > 0) {
                dataAfterConstantFilters = dataAfterConstantFilters.filter(row => {
                    const rowValue = row[column]?.toString().toLowerCase() || '';
                    return filterValues.includes(rowValue);
                });
            }
        }
    }
    setDataForSummaries(dataAfterConstantFilters);


    let dataAfterDateFilters = [...dataAfterConstantFilters];
    // Date filters
    if (dateFilter && dateFilter !== 'all' && dateColumn) {
        const today = startOfToday();
        dataAfterDateFilters = dataAfterDateFilters.filter(row => {
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

    setFilteredData(dataAfterDateFilters);
  }, [fileData, dateFilter, dateColumn, constantFilters]);


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
                onClear={resetFileUpload}
              />
            </div>
            <div className="lg:col-span-8 xl:col-span-9">
              <DataTable 
                data={filteredData} 
                headers={headers} 
                visibleColumns={selectedColumns} 
                originalData={fileData} 
                dataForSummaries={dataForSummaries}
                packedSerials={packedSerials}
                onPackingFileSelect={handlePackingFile}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
