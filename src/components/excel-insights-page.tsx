'use client';

import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import AppHeader from '@/components/app-header';
import { ThemeToggle } from '@/components/theme-toggle';
import { FileUpload } from '@/components/file-upload';
import { ConfigPanel } from '@/components/config-panel';
import { AnalyticsDashboard } from '@/components/analytics-dashboard';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { Loader2, BarChart3, ChevronUp, ChevronDown, CloudUpload, CloudDownload, Users, Globe, FileUp, TableIcon } from 'lucide-react';
import { dbService } from '@/lib/db-service';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { read, utils } from 'xlsx';
import { startOfToday, isValid, addDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';

export type ConstantFilter = { id: string; column: string; value: string; enabled?: boolean };

const STORAGE_KEYS = {
  FILTERS: 'prod-extractor-filters',
  COLUMNS: 'prod-extractor-columns'
};

export default function ExcelInsightsPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  // Persistence labels
  const [persistedFileName, setPersistedFileName] = useState<string | null>(null);

  // Filter States
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [dateColumn, setDateColumn] = useState<string>('');
  const [constantFilters, setConstantFilters] = useState<ConstantFilter[]>([]);

  // Packing Data
  const [packedSerials, setPackedSerials] = useState<Map<string, Date>>(new Map());

  // UI States
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filtered Data
  const [filteredData, setFilteredData] = useState<any[] | null>(null);
  const [dataForSummaries, setDataForSummaries] = useState<any[] | null>(null);

  // --- Persistence Persistence (Local) ---
  useEffect(() => {
    const savedFilters = localStorage.getItem(STORAGE_KEYS.FILTERS);
    const savedCols = localStorage.getItem(STORAGE_KEYS.COLUMNS);
    if (savedFilters) setConstantFilters(JSON.parse(savedFilters));
    if (savedCols) setSelectedColumns(JSON.parse(savedCols));
  }, []);

  useEffect(() => {
    if (constantFilters.length > 0) {
      localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(constantFilters));
    }
    if (selectedColumns.length > 0) {
      localStorage.setItem(STORAGE_KEYS.COLUMNS, JSON.stringify(selectedColumns));
    }
  }, [constantFilters, selectedColumns]);

  const handleFile = useCallback((selectedFile: File) => {
    setIsLoading(true);
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const bstr = e.target?.result;
      const wb = read(bstr, { type: 'binary', cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = utils.sheet_to_json(ws);
      setFileData(data);
      if (data.length > 0) {
        const cols = Object.keys(data[0] as object);
        setHeaders(cols);

        // Only override selected columns if not already persisted
        if (selectedColumns.length === 0) {
          setSelectedColumns(cols.slice(0, 10));
        }

        // Auto-detect date column
        const dateCol = cols.find(c => {
          const lowC = c.toLowerCase();
          return lowC.includes('date') || lowC.includes('fecha') || lowC.includes('schedule');
        });
        if (dateCol) setDateColumn(dateCol);
      }
      setIsLoading(false);
    };
    reader.readAsBinaryString(selectedFile);
  }, [selectedColumns]);

  const resetFileUpload = useCallback(() => {
    setFile(null);
    setFileData(null);
    setHeaders([]);
    setSelectedColumns([]);
    setPackedSerials(new Map());
    setFilteredData(null);
    setDataForSummaries(null);
    setPersistedFileName(null);
    setFileKey(prev => prev + 1);
    localStorage.removeItem(STORAGE_KEYS.FILTERS);
    localStorage.removeItem(STORAGE_KEYS.COLUMNS);
  }, []);

  const handlePackingFile = useCallback((selectedFile: File) => {
    if (selectedFile.size === 0) {
      setPackedSerials(new Map());
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const bstr = e.target?.result;
      const wb = read(bstr, { type: 'binary', cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = utils.sheet_to_json(ws) as any[];

      const serialMap = new Map<string, Date>();
      data.forEach(row => {
        const serial = row['Seriales'] || row['Serial'] || row['SERIAL'];
        const date = row['Packed Date'] || row['Date'] || row['Fecha'];
        if (serial) {
          serialMap.set(String(serial).trim(), date instanceof Date ? date : new Date());
        }
      });
      setPackedSerials(serialMap);
      toast({ title: "Empaque cargado", description: `${serialMap.size} seriales cargados.` });
    };
    reader.readAsBinaryString(selectedFile);
  }, [toast]);

  const handleCloudSync = async () => {
    if (!fileData) return;
    setIsSyncing(true);
    try {
      await dbService.saveProjectData(
        file?.name || persistedFileName || 'Shared Report',
        fileData,
        {
          selectedColumns,
          dateFilter,
          dateColumn,
          constantFilters
        },
        Array.from(packedSerials.entries())
      );
      toast({ title: "Reporte sincronizado", description: "El reporte se guardó correctamente en la nube." });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo sincronizar el reporte." });
    } finally {
      setIsSyncing(false);
    }
  };

  const loadFromCloud = async () => {
    setIsLoading(true);
    try {
      const report = await dbService.getProjectData();
      if (report) {
        setFileData(report.data);
        setPersistedFileName(report.fileName);
        if (report.data.length > 0) {
          setHeaders(Object.keys(report.data[0]));
        }
        if (report.config) {
          setSelectedColumns(report.config.selectedColumns || []);
          setDateFilter(report.config.dateFilter || 'all');
          setDateColumn(report.config.dateColumn || '');
          setConstantFilters(report.config.constantFilters || []);
        }
        if (report.packedSerials) {
          setPackedSerials(new Map(report.packedSerials));
        }
        toast({ title: "Datos cargados", description: "Se cargó el último reporte de la nube." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos." });
    } finally {
      setIsLoading(false);
    }
  };

  // Re-filter data when dependencies change
  React.useEffect(() => {
    if (!fileData) return;

    let dataAfterConstantFilters = [...fileData];
    const constantFilterObject = constantFilters.reduce((acc, f) => {
      if (f.enabled !== false && f.column && f.value) {
        acc[f.column] = f.value;
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
    if (dateFilter && dateFilter !== 'all' && dateColumn) {
      const today = startOfToday();
      dataAfterDateFilters = dataAfterDateFilters.filter(row => {
        let val = row[dateColumn];
        if (!val) return false;

        let itemDate: Date | null = null;
        if (val instanceof Date) {
          itemDate = val;
        } else if (typeof val === 'number') {
          // Robust Excel Serial to JS Date
          itemDate = new Date(Math.round((val - 25569) * 86400 * 1000));
        } else {
          // Try standard parsing for strings
          const parsed = new Date(val);
          if (isValid(parsed)) itemDate = parsed;
        }

        if (!itemDate || !isValid(itemDate)) return false;

        // Clean comparison by normalizing to start of day
        const currentItemDate = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());

        switch (dateFilter) {
          case 'overdue':
            return currentItemDate < today;
          case 'due-soon-7': {
            const aWeekFromNow = addDays(today, 7);
            return currentItemDate >= today && currentItemDate <= aWeekFromNow;
          }
          case 'current-month': {
            const start = startOfMonth(today);
            const end = endOfMonth(today);
            return currentItemDate >= start && currentItemDate <= end;
          }
          default: return true;
        }
      });
    }
    setFilteredData(dataAfterDateFilters);
  }, [fileData, dateFilter, dateColumn, constantFilters]);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="relative">
        <AppHeader />
        <div className="absolute top-4 right-4 z-50">
          <ThemeToggle />
        </div>
      </div>
      <main className="flex-1 container mx-auto px-4 md:px-6 py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p className="text-lg text-muted-foreground">Procesando archivo...</p>
          </div>
        ) : (
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-4 xl:col-span-3">
              <ConfigPanel
                fileName={file?.name ?? persistedFileName ?? 'Unknown file'}
                headers={headers}
                selectedColumns={selectedColumns}
                setSelectedColumns={setSelectedColumns}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                dateColumn={dateColumn}
                setDateColumn={setDateColumn}
                constantFilters={constantFilters}
                setConstantFilters={setConstantFilters}
                onMainFileSelect={handleFile}
                onPackingFileSelect={handlePackingFile}
                onClear={resetFileUpload}
              />
              <div className="mt-4 p-4 border rounded-md bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Nube</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-white dark:bg-background h-8 text-xs border-blue-200"
                  onClick={handleCloudSync}
                  disabled={isSyncing || !fileData}
                >
                  {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CloudUpload className="h-3 w-3 mr-1" />}
                  Sincronizar
                </Button>
              </div>
            </div>
            <div className="lg:col-span-8 xl:col-span-9">
              {!fileData ? (
                <div className="flex flex-col items-center justify-center p-8 bg-card rounded-xl border-2 border-dashed h-full min-h-[60vh] transition-all hover:bg-muted/5">
                  <FileUpload onFileSelect={handleFile} />
                  <div className="mt-12 flex flex-col items-center gap-4 border-t pt-8 w-full max-w-md opacity-60">
                    <span className="text-[10px] uppercase font-bold tracking-[0.2em]">Opciones Rápidas</span>
                    <div className="flex gap-4">
                      <Button variant="outline" size="sm" onClick={loadFromCloud}>
                        <CloudDownload className="mr-2 h-4 w-4 text-blue-500" />
                        De la Nube
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex justify-between items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAnalytics(!showAnalytics)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showAnalytics ? <ChevronUp className="mr-2 h-4 w-4" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                      {showAnalytics ? "Ocultar Análisis" : "Mostrar Análisis"}
                    </Button>
                  </div>

                  {showAnalytics && <AnalyticsDashboard data={filteredData || []} packedSerials={packedSerials} />}

                  <DataTable
                    data={filteredData}
                    headers={headers}
                    visibleColumns={selectedColumns}
                    originalData={fileData}
                    dataForSummaries={dataForSummaries}
                    packedSerials={new Set(packedSerials.keys())}
                    onPackingFileSelect={handlePackingFile}
                    onClear={resetFileUpload}
                    fileName={file?.name ?? persistedFileName ?? 'Unknown file'}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
