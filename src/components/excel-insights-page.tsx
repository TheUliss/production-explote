'use client';

import * as React from 'react';
import * as xlsx from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { addDays, endOfMonth, startOfMonth, startOfToday, isValid, parseISO } from 'date-fns';

import AppHeader from '@/components/app-header';
import { FileUpload } from '@/components/file-upload';
import { ConfigPanel } from '@/components/config-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { AnalyticsDashboard } from '@/components/analytics-dashboard';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { Loader2, BarChart3, ChevronUp, ChevronDown, CloudUpload, CloudDownload, Users, Globe } from 'lucide-react';
import { dbService } from '@/lib/db-service';


export type ConstantFilter = { id: string; column: string; value: string; enabled?: boolean };

// Define the columns to always keep and their desired order.
const REQUIRED_COLUMNS = ["Schedule Date", "Schedule Group", "Job Number", "Item Description", "Qty Ordered", "Customer"];

// Helper function to serialize dates for localStorage
const serializeData = (data: any[]) => {
  return data.map(row => {
    const newRow: any = {};
    for (const key in row) {
      if (row[key] instanceof Date) {
        newRow[key] = { __isDate: true, value: row[key].toISOString() };
      } else {
        newRow[key] = row[key];
      }
    }
    return newRow;
  });
};

// Helper function to deserialize dates from localStorage
const deserializeData = (data: any[]) => {
  return data.map(row => {
    const newRow: any = {};
    for (const key in row) {
      if (row[key] && row[key].__isDate) {
        newRow[key] = parseISO(row[key].value);
      } else {
        newRow[key] = row[key];
      }
    }
    return newRow;
  });
};

export default function ExcelInsightsPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [fileData, setFileData] = React.useState<any[] | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [fileKey, setFileKey] = React.useState(0);
  const [filteredData, setFilteredData] = React.useState<any[] | null>(null);
  const [dataForSummaries, setDataForSummaries] = React.useState<any[] | null>(null);
  const [packedSerials, setPackedSerials] = React.useState<Map<string, Date>>(new Map());
  const [isLoading, setIsLoading] = React.useState(false);
  const [showAnalytics, setShowAnalytics] = React.useState(true);
  const [isSyncing, setIsSyncing] = React.useState(false);

  // Persistent State
  const [selectedColumns, setSelectedColumns] = useLocalStorage<string[]>('excel-insights-selectedColumns', []);
  const [dateFilter, setDateFilter] = useLocalStorage<string>('excel-insights-dateFilter', 'all');
  const [dateColumn, setDateColumn] = useLocalStorage<string>('excel-insights-dateColumn', '');
  const [constantFilters, setConstantFilters] = useLocalStorage<ConstantFilter[]>('excel-insights-constantFilters', []);
  const [persistedFileData, setPersistedFileData] = useLocalStorage<any[] | null>('excel-insights-fileData', null);
  const [persistedHeaders, setPersistedHeaders] = useLocalStorage<string[]>('excel-insights-headers', []);
  const [persistedFileName, setPersistedFileName] = useLocalStorage<string>('excel-insights-fileName', '');


  const { toast } = useToast();

  // Load persisted data on mount
  React.useEffect(() => {
    if (persistedFileData && persistedHeaders.length > 0 && !fileData) {
      const deserializedData = deserializeData(persistedFileData);
      setFileData(deserializedData);
      setHeaders(persistedHeaders);

      // Validate selected columns
      const validColumns = selectedColumns.filter(col => persistedHeaders.includes(col));
      if (validColumns.length === 0) {
        setSelectedColumns(persistedHeaders);
      }
    }
  }, []);

  const resetFileUpload = () => {
    setFile(null);
    setFileData(null);
    setHeaders([]);
    setFilteredData(null);
    setDataForSummaries(null);
    setPackedSerials(new Map());
    setFileKey(prev => prev + 1);
    // Clear persisted data
    setPersistedFileData(null);
    setPersistedHeaders([]);
    setPersistedFileName('');
  };

  const handleCloudSync = async () => {
    if (!fileData) return;
    setIsSyncing(true);
    try {
      await dbService.saveProjectData(file?.name || persistedFileName, fileData, selectedColumns);
      toast({ title: "Sincronizado", description: "Los datos están ahora en la nube para colaboración." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error de Sincronización", description: "Verifica tu configuración de Firebase." });
    } finally {
      setIsSyncing(false);
    }
  };

  const loadFromCloud = async () => {
    setIsLoading(true);
    try {
      const cloudData = await dbService.getProjectData();
      if (cloudData) {
        const deserializedData = deserializeData(cloudData.data);
        setFileData(deserializedData);
        setHeaders(cloudData.selectedColumns); // or re-extract all from data
        setSelectedColumns(cloudData.selectedColumns);
        setPersistedFileName(cloudData.fileName);
        toast({ title: "Cargado desde la nube", description: `Archivo: ${cloudData.fileName}` });
      } else {
        toast({ title: "No hay datos", description: "No se encontró ningún proyecto compartido en la nube." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFile = (uploadedFile: File) => {
    if (!uploadedFile) return;

    resetFileUpload();
    setFile(uploadedFile);
    setIsLoading(true);

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

          // 1. Get all available headers from the file
          // const availableHeaders = REQUIRED_COLUMNS.filter(h => originalHeaders.includes(h)); // OLD LOGIC
          const availableHeaders = originalHeaders;

          // Check if at least some required columns exist (optional validation, maybe we still want to warn?)
          const presentRequiredColumns = REQUIRED_COLUMNS.filter(h => originalHeaders.includes(h));

          if (presentRequiredColumns.length === 0) {
            throw new Error(`No se encontraron columnas requeridas. El archivo debe contener al menos alguna de: ${REQUIRED_COLUMNS.join(', ')}`);
          }

          const missingColumns = REQUIRED_COLUMNS.filter(h => !originalHeaders.includes(h));
          if (missingColumns.length > 0) {
            toast({
              title: "Advertencia",
              description: `Algunas columnas estándar no se encontraron: ${missingColumns.join(', ')}. Puedes seleccionar otras columnas manualmente.`,
            });
          }

          // 2. Pre-filter and reorder columns for every row.
          let processedData = json.map((row, rowIndex) => {
            const newRow: any = {};
            availableHeaders.forEach(header => {
              let value = row[header];

              // Validate Schedule Date
              if (header === "Schedule Date" && value !== undefined && value !== null) {
                if (!(value instanceof Date) || !isValid(value)) {
                  console.warn(`Fila ${rowIndex + 2}: Fecha inválida en Schedule Date`);
                  value = null;
                }
              }

              newRow[header] = value;
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

          // Persist data
          setPersistedFileData(serializeData(processedData));
          setPersistedHeaders(availableHeaders);
          setPersistedFileName(uploadedFile.name);

          // Validate persisted states
          const validPersistedColumns = selectedColumns.filter(col => availableHeaders.includes(col));
          if (validPersistedColumns.length > 0) {
            setSelectedColumns(validPersistedColumns);
          } else {
            // Default to ONLY the required columns that exist in the file
            setSelectedColumns(presentRequiredColumns);
          }

          if (!availableHeaders.includes(dateColumn)) {
            setDateColumn(availableHeaders.includes("Schedule Date") ? "Schedule Date" : '');
          }

          setConstantFilters(prev => prev.filter(f => availableHeaders.includes(f.column) || f.column === ''));

          toast({
            title: "Archivo cargado",
            description: `${processedData.length} registros procesados correctamente.`,
          });

        } else {
          throw new Error('No se encontraron datos en el archivo Excel.');
        }
      } catch (error) {
        console.error(error);
        toast({
          variant: 'destructive',
          title: 'Error al leer el archivo',
          description: error instanceof Error ? error.message : 'No se pudo procesar el archivo Excel. Verifica que sea válido.',
        });
        resetFileUpload();
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'Error de lectura',
        description: 'Ocurrió un error al leer el archivo.',
      });
      resetFileUpload();
      setIsLoading(false);
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const handlePackingFile = (packingFile: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = xlsx.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (json.length < 2) { // must have header and at least one row
          throw new Error("El archivo de empaque está vacío o no tiene filas de datos.");
        }

        const headers = json[0].map(h => h?.toString().trim());
        const serialsColIndex = headers.findIndex(h => h === 'Seriales');
        const dateColIndex = headers.findIndex(h => h === 'Packed Date');

        if (serialsColIndex === -1) {
          throw new Error('No se encontró la columna "Seriales" en el archivo de empaque.');
        }

        const loadedSerials = new Map<string, Date>();
        // Start from 1 to skip header row
        for (let i = 1; i < json.length; i++) {
          const serial = json[i][serialsColIndex]?.toString().trim();
          let packedDate = json[i][dateColIndex];

          if (serial) {
            // Ensure we have a valid Date object if the column exists
            const dateObj = packedDate instanceof Date && isValid(packedDate) ? packedDate : new Date();
            loadedSerials.set(serial, dateObj);
          }
        }

        setPackedSerials(loadedSerials);

        toast({
          title: "Datos de empaque cargados",
          description: `${loadedSerials.size} seriales empacados han sido cargados.`,
        });
      } catch (error) {
        console.error(error);
        toast({
          variant: 'destructive',
          title: 'Error al leer archivo de empaque',
          description: error instanceof Error ? error.message : 'No se pudo procesar el archivo de empaque.',
        });
        setPackedSerials(new Map()); // Reset on error
      }
    };
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'Error de lectura',
        description: 'Ocurrió un error al leer el archivo de empaque.',
      });
      setPackedSerials(new Map());
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
      // Default to enabled if property is missing (backward compatibility)
      const isEnabled = filter.enabled !== false;

      if (filter.column && filter.value && isEnabled) {
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
        ) : !fileData ? (
          <div className="space-y-6">
            <FileUpload onFileSelect={handleFile} key={fileKey} />
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-muted-foreground">O también puedes</span>
              <Button variant="outline" size="sm" onClick={loadFromCloud}>
                <CloudDownload className="mr-2 h-4 w-4 text-blue-500" />
                Cargar último proyecto compartido (Cloud)
              </Button>
            </div>
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
              />
              <div className="mt-4 p-4 border rounded-md bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Colaboración en Tiempo Real</span>
                </div>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 mb-3">Sincroniza tus datos para que otros miembros del equipo puedan ver este reporte.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-white dark:bg-background h-8 text-xs border-blue-200"
                  onClick={handleCloudSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CloudUpload className="h-3 w-3 mr-1" />}
                  Subir a la nube
                </Button>
              </div>
            </div>
            <div className="lg:col-span-8 xl:col-span-9">
              {/* Analytics Dashboard Toggle */}
              <div className="mb-4 flex justify-between items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAnalytics(!showAnalytics)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showAnalytics ? <ChevronUp className="mr-2 h-4 w-4" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                  {showAnalytics ? "Ocultar Análisis" : "Mostrar Análisis de Producción"}
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
