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
import { Loader2, BarChart3, ChevronUp, Settings2, RefreshCcw } from 'lucide-react';
import { dbService } from '@/lib/db-service';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { read, utils } from 'xlsx';
import { isValid, isWithinInterval } from 'date-fns';
import { useOverdueNotifications } from '@/hooks/use-overdue-notifications';
import { DateRange } from 'react-day-picker';
import { getShiftForDate } from '@/lib/types';
import { AuditLog, type AuditLogEntry } from '@/components/audit-log';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollText } from 'lucide-react';

export type ConstantFilter = { id: string; column: string; value: string; enabled?: boolean };

const STORAGE_KEYS = {
  FILTERS: 'prod-extractor-filters',
  COLUMNS: 'prod-extractor-columns',
  PACKED_SERIALS: 'prod-extractor-packed-serials',
  FILE_DATA: 'prod-extractor-file-data',
  FILE_NAME: 'prod-extractor-file-name',
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [constantFilters, setConstantFilters] = useState<ConstantFilter[]>([]);

  // Audit Log
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const addAuditLog = (action: string, details: string) => {
    setAuditLogs(prev => [...prev, {
      id: Math.random().toString(36),
      action,
      details,
      timestamp: new Date()
    }]);
  };

  // Packing Data
  const [packedSerials, setPackedSerials] = useState<Map<string, Date>>(new Map());
  const [packedData, setPackedData] = useState<any[]>([]);

  // UI States
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('prod-extractor-last-sync');
    return saved ? new Date(saved) : null;
  });

  // Filtered Data
  const [filteredData, setFilteredData] = useState<any[] | null>(null);
  const [dataForSummaries, setDataForSummaries] = useState<any[] | null>(null);

  // Notifications
  useOverdueNotifications(filteredData);

  // --- Persistence (Local) ---
  useEffect(() => {
    const savedFilters = localStorage.getItem(STORAGE_KEYS.FILTERS);
    const savedCols = localStorage.getItem(STORAGE_KEYS.COLUMNS);
    const savedPacked = localStorage.getItem(STORAGE_KEYS.PACKED_SERIALS);
    const savedFileData = localStorage.getItem(STORAGE_KEYS.FILE_DATA);
    const savedFileName = localStorage.getItem(STORAGE_KEYS.FILE_NAME);
    if (savedFilters) setConstantFilters(JSON.parse(savedFilters));
    if (savedCols) setSelectedColumns(JSON.parse(savedCols));
    if (savedPacked) {
      const entries: [string, string][] = JSON.parse(savedPacked);
      setPackedSerials(new Map(entries.map(([k, v]) => [k, new Date(v)])));
    }
    if (savedFileData) {
      const parsed = JSON.parse(savedFileData);
      // Re-hydrate Date objects from ISO strings
      const rehydrated = parsed.map((row: any) => {
        const newRow = { ...row };
        Object.keys(newRow).forEach(k => {
          if (typeof newRow[k] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(newRow[k])) {
            const d = new Date(newRow[k]);
            if (!isNaN(d.getTime())) newRow[k] = d;
          }
        });
        return newRow;
      });
      setFileData(rehydrated);
      if (rehydrated.length > 0) setHeaders(Object.keys(rehydrated[0]));
    }
    if (savedFileName) setPersistedFileName(savedFileName);
  }, []);

  useEffect(() => {
    if (constantFilters.length > 0) {
      localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(constantFilters));
    }
    if (selectedColumns.length > 0) {
      localStorage.setItem(STORAGE_KEYS.COLUMNS, JSON.stringify(selectedColumns));
    }
  }, [constantFilters, selectedColumns]);

  // Persist packedSerials whenever it changes
  useEffect(() => {
    const entries = Array.from(packedSerials.entries()).map(([k, v]) => [k, v.toISOString()]);
    localStorage.setItem(STORAGE_KEYS.PACKED_SERIALS, JSON.stringify(entries));
  }, [packedSerials]);

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
      // Persist file data and name to localStorage
      try {
        localStorage.setItem(STORAGE_KEYS.FILE_DATA, JSON.stringify(data));
        localStorage.setItem(STORAGE_KEYS.FILE_NAME, selectedFile.name);
      } catch (e) {
        // localStorage might be full for very large files — fail silently
        console.warn('Could not persist file data to localStorage:', e);
      }
      if (data.length > 0) {
        const cols = Object.keys(data[0] as object);
        setHeaders(cols);

        // Only override selected columns if not already persisted
        if (selectedColumns.length === 0) {
          setSelectedColumns(cols.slice(0, 10));
        }

        // Auto-detect date column
        const dateCol = cols.find(c => {
          const lowC = c?.toLowerCase();
          return lowC?.includes('date') || lowC?.includes('fecha') || lowC?.includes('schedule');
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
    setPackedData([]);
    setFilteredData(null);
    setDataForSummaries(null);
    setPersistedFileName(null);
    setFileKey(prev => prev + 1);
    localStorage.removeItem(STORAGE_KEYS.FILTERS);
    localStorage.removeItem(STORAGE_KEYS.COLUMNS);
    localStorage.removeItem(STORAGE_KEYS.PACKED_SERIALS);
    localStorage.removeItem(STORAGE_KEYS.FILE_DATA);
    localStorage.removeItem(STORAGE_KEYS.FILE_NAME);
  }, []);

  const handlePackingFile = useCallback((selectedFile: File) => {
    if (selectedFile.size === 0) {
      setPackedSerials(new Map());
      setPackedData([]);
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
      setPackedData(data);
      toast({ title: "Empaque cargado", description: `${serialMap.size} seriales cargados.` });
    };
    reader.readAsBinaryString(selectedFile);
  }, [toast]);

  const handleCloudSync = async () => {
    if (!fileData) return;
    setIsSyncing(true);
    try {
      // Only save config/metadata to Firestore (avoids 1MB document limit).
      // Raw file data is already persisted in localStorage.
      await dbService.saveProjectConfig(
        file?.name || persistedFileName || 'Shared Report',
        {
          selectedColumns,
          dateFilter,
          dateColumn,
          constantFilters
        },
        Array.from(packedSerials.entries()).map(([k, v]) => [k, v.toISOString()])
      );
      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem('prod-extractor-last-sync', now.toISOString());
      toast({ title: "Configuración sincronizada", description: "La configuración se guardó en la nube. Los datos del archivo se mantienen localmente." });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo sincronizar la configuración." });
    } finally {
      setIsSyncing(false);
    }
  };

  const loadFromCloud = async () => {
    setIsLoading(true);
    try {
      // Load config from Firestore; data comes from localStorage
      const report = await dbService.getProjectConfig();
      if (report) {
        if (report.config) {
          setSelectedColumns(report.config.selectedColumns || []);
          setDateFilter(report.config.dateFilter || 'all');
          setDateColumn(report.config.dateColumn || '');
          setConstantFilters(report.config.constantFilters || []);
        }
        if (report.packedSerials) {
          const entries: [string, string][] = report.packedSerials;
          setPackedSerials(new Map(entries.map(([k, v]: [string, string]) => [k, new Date(v)])));
        }
        if (report.fileName) setPersistedFileName(report.fileName);
        toast({ title: "Configuración cargada", description: "Se restauró la configuración de la nube." });
      } else {
        toast({ title: "Sin datos en la nube", description: "No se encontró ninguna configuración guardada." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la configuración." });
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
            const rowValue = row[column]?.toString()?.toLowerCase() || '';
            return filterValues.includes(rowValue);
          });
        }
      }
    }
    setDataForSummaries(dataAfterConstantFilters);

    let dataAfterDateFilters = [...dataAfterConstantFilters];
    if (dateFilter && dateFilter !== 'all' && dateColumn) {
      // Normalize today to UTC midnight for comparison
      const now = new Date();
      const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

      dataAfterDateFilters = dataAfterDateFilters.filter(row => {
        let val = row[dateColumn];
        if (val === undefined || val === null || val === '') return false;

        let itemDate: Date | null = null;
        if (val instanceof Date) {
          itemDate = val;
        } else if (typeof val === 'number') {
          // Robust Excel Serial: Ignore numbers that are definitely not dates (e.g., Qty, Line)
          // 40000 is approx July 2009. Production data is usually recent (45000+).
          // If the number is too small, it's probably not a date.
          if (val < 30000) return false;
          itemDate = new Date(Math.round((val - 25569) * 86400 * 1000));
        } else {
          const parsed = new Date(val);
          if (isValid(parsed)) itemDate = parsed;
        }

        if (!itemDate || !isValid(itemDate)) return false;

        // Use UTC components to avoid timezone shifts (Excel dates are typically date-only)
        const itemUTC = Date.UTC(itemDate.getUTCFullYear(), itemDate.getUTCMonth(), itemDate.getUTCDate());

        switch (dateFilter) {
          case 'overdue':
            return itemUTC < todayUTC;
          case 'due-soon-7': {
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
            return itemUTC >= todayUTC && itemUTC <= (todayUTC + sevenDaysInMs);
          }
          case 'current-month': {
            const itemMonth = new Date(itemUTC).getUTCMonth();
            const itemYear = new Date(itemUTC).getUTCFullYear();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            return itemMonth === currentMonth && itemYear === currentYear;
          }
          case 'custom': {
            if (!dateRange?.from) return true;
            // We need to compare specific dates. 
            // itemDate is already a valid Date object.
            const from = dateRange.from;
            const to = dateRange.to || dateRange.from;
            return isWithinInterval(itemDate, { start: from, end: to });
          }
          default: return true;
        }
      });
    }
    setFilteredData(dataAfterDateFilters);
  }, [fileData, dateFilter, dateColumn, constantFilters, dateRange]);

  const [mobileConfigOpen, setMobileConfigOpen] = React.useState(false);

  const configPanelProps = {
    fileName: file?.name ?? persistedFileName ?? 'Unknown file',
    headers,
    selectedColumns,
    setSelectedColumns,
    dateFilter,
    setDateFilter,
    dateColumn,
    setDateColumn,
    dateRange,
    setDateRange,
    constantFilters,
    setConstantFilters,
    onMainFileSelect: (f: File) => { handleFile(f); addAuditLog('File Uploaded', f.name); setMobileConfigOpen(false); },
    onPackingFileSelect: (f: File) => { handlePackingFile(f); addAuditLog('Packing File Uploaded', f.name); },
    onClearPacking: () => { setPackedSerials(new Map()); setPackedData([]); addAuditLog('Packing', 'Packing file cleared'); },
    onClear: () => { resetFileUpload(); addAuditLog('System', 'All data cleared'); setMobileConfigOpen(false); },
    packedCount: packedSerials.size,
  };

  const activeFilterCount = constantFilters.filter(f => f.enabled !== false && f.column && f.value).length
    + (dateFilter !== 'all' ? 1 : 0);

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Mobile Top Bar ── */}
      <div className="lg:hidden flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Sheet open={mobileConfigOpen} onOpenChange={setMobileConfigOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2 relative">
                <Settings2 className="h-4 w-4" />
                <span className="text-xs font-medium">Opciones</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm p-0 flex flex-col overflow-y-auto">
              <div className="p-4 border-b">
                <SheetTitle className="text-base">Configuración</SheetTitle>
                <SheetDescription className="text-xs truncate">{file?.name ?? persistedFileName ?? 'Sin archivo'}</SheetDescription>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <ConfigPanel {...configPanelProps} inDrawer={true} />
                <div className="mt-2">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                        <ScrollText className="mr-2 h-3.5 w-3.5" />
                        Ver Registro de Actividad
                      </Button>
                    </SheetTrigger>
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>Registro de Actividad</SheetTitle>
                        <SheetDescription>Acciones recientes en la sesión actual.</SheetDescription>
                      </SheetHeader>
                      <div className="mt-4">
                        <AuditLog logs={auditLogs} />
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          {fileData && (
            <span className="text-xs text-muted-foreground truncate max-w-[140px]">
              {file?.name ?? persistedFileName ?? ''}
            </span>
          )}
        </div>
        <ThemeToggle />
      </div>

      {/* ── Desktop Header ── */}
      <div className="hidden lg:block relative">
        <AppHeader />
        <div className="absolute top-4 right-4 z-50">
          <ThemeToggle />
        </div>
      </div>

      <main className="flex-1 container mx-auto px-3 md:px-4 lg:px-6 py-4 lg:py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p className="text-lg text-muted-foreground">Procesando archivo...</p>
          </div>
        ) : (
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-8">
            {/* ── Desktop Sidebar (hidden on mobile) ── */}
            <div className="hidden lg:block lg:col-span-4 xl:col-span-3">
              <ConfigPanel {...configPanelProps} />

              {/* Audit Log Trigger */}
              <div className="mt-4">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                      <ScrollText className="mr-2 h-3.5 w-3.5" />
                      Ver Registro de Actividad
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Registro de Actividad</SheetTitle>
                      <SheetDescription>Acciones recientes en la sesión actual.</SheetDescription>
                    </SheetHeader>
                    <div className="mt-4">
                      <AuditLog logs={auditLogs} />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* ── Main Content ── */}
            <div className="lg:col-span-8 xl:col-span-9">
              {!fileData ? (
                <div className="flex flex-col items-center justify-center p-6 md:p-8 bg-card rounded-xl border-2 border-dashed min-h-[60vh] transition-all hover:bg-muted/5">
                  <FileUpload onFileSelect={(f) => { handleFile(f); addAuditLog('File Uploaded', f.name); }} />
                </div>
              ) : (
                <>
                  <div className="mb-3 flex justify-between items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAnalytics(!showAnalytics)}
                      className="text-muted-foreground hover:text-foreground text-xs md:text-sm"
                    >
                      {showAnalytics ? <ChevronUp className="mr-1.5 h-4 w-4" /> : <BarChart3 className="mr-1.5 h-4 w-4" />}
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
                    packedData={packedData}
                    setPackedData={setPackedData}
                    onManualPackedRowAdd={(serial, date) => setPackedSerials(prev => new Map(prev).set(serial, date))}
                    onPackingFileSelect={handlePackingFile}
                    onClearPacking={() => { setPackedSerials(new Map()); setPackedData([]); }}
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
