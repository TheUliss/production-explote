'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { read, utils } from 'xlsx';
import { startOfToday, isValid, addDays, startOfMonth, endOfMonth } from 'date-fns';

export type ConstantFilter = { id: string; column: string; value: string; enabled?: boolean };

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
        setSelectedColumns(cols.slice(0, 10)); // Default first 10
        // Auto-detect date column
        const dateCol = cols.find(c => c.toLowerCase().includes('date') || c.toLowerCase().includes('fecha') || c.toLowerCase().includes('schedule'));
        if (dateCol) setDateColumn(dateCol);
      }
      setIsLoading(false);
    };
    reader.readAsBinaryString(selectedFile);
  }, []);

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
        const itemDate = row[dateColumn];
        if (!(itemDate instanceof Date) || !isValid(itemDate)) return false;

        switch (dateFilter) {
          case 'overdue': return itemDate < today;
          case 'due-soon-7':
            const aWeekFromNow = addDays(today, 7);
            return itemDate >= today && itemDate <= aWeekFromNow;
          case 'current-month':
            return itemDate >= startOfMonth(today) && itemDate <= endOfMonth(today);
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
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Colaboración en Tiempo Real</span>
                </div>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 mb-3">Sincroniza tus datos para que otros puedan ver este reporte.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-white dark:bg-background h-8 text-xs border-blue-200"
                  onClick={handleCloudSync}
                  disabled={isSyncing || !fileData}
                >
                  {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CloudUpload className="h-3 w-3 mr-1" />}
                  Subir a la nube
                </Button>
              </div>
            </div>
            <div className="lg:col-span-8 xl:col-span-9">
              {!fileData ? (
                <div className="flex flex-col items-center justify-center h-[65vh] border-2 border-dashed rounded-xl bg-muted/20 text-muted-foreground/60 transition-all">
                  <TableIcon className="h-20 w-20 mb-6 opacity-10" />
                  <h3 className="text-xl font-semibold text-foreground/70">Esperando datos de producción</h3>
                  <p className="max-w-xs text-center text-sm mt-2 font-light">
                    Sube tu archivo principal desde el panel de configuración a la izquierda para comenzar.
                  </p>
                  <div className="mt-8 pt-6 border-t w-48 text-center animate-pulse">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4">Opciones de Red</p>
                    <Button variant="outline" size="sm" onClick={loadFromCloud} className="w-full">
                      <CloudDownload className="mr-2 h-4 w-4 text-blue-500" />
                      Cargar de la Nube
                    </Button>
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
