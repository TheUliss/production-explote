'use client';

import * as React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from './ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, TableIcon, Trash2, Upload, FileUp, FileDown, Copy, CheckCircle2, Clock, AlertCircle, Zap } from 'lucide-react';
import * as xlsx from 'xlsx';
import { downloadReport } from '@/lib/xlsx-utils';
import { PdfExportButton } from './pdf-export-button';
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from './ui/checkbox';
import { cn } from '@/lib/utils';
import { addDays, startOfToday } from 'date-fns';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import type { ProductionRow } from '@/lib/types';
import { useProductionFilters } from '@/hooks/use-production-filters';

/** Count how many serials belonging to `row` exist in `packedSerials`. */
function countPackedForRow(row: any, packedSerials: Set<string>): { packed: number; total: number } {
    if (!packedSerials.size) return { packed: 0, total: 0 };
    const jobNumber = row['Job Number']?.toString();
    const qty = parseInt(row['Qty Ordered'] ?? '0', 10);
    if (!jobNumber || isNaN(qty) || qty <= 0) return { packed: 0, total: qty || 0 };
    const padLength = Math.max(3, String(qty).length);
    let packed = 0;
    for (let i = 1; i <= qty; i++) {
        const serial = `${jobNumber}-01-${i.toString().padStart(padLength, '0')}`;
        if (packedSerials.has(serial)) packed++;
    }
    return { packed, total: qty };
}

/** Highlights occurrences of `term` inside `text` with a <mark> element. */
function HighlightText({ text, term }: { text: string; term: string }) {
    if (!term.trim()) return <>{text}</>;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
        <>
            {parts.map((part, i) =>
                regex.test(part)
                    ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded-sm px-0.5">{part}</mark>
                    : part
            )}
        </>
    );
}

interface DataTableProps {
    data: ProductionRow[] | null;
    headers: string[];
    visibleColumns: string[];
    originalData: ProductionRow[] | null;
    dataForSummaries: ProductionRow[] | null;
    packedSerials: Set<string>;
    packedData?: any[];
    setPackedData?: React.Dispatch<React.SetStateAction<any[]>>;
    onManualPackedRowAdd?: (serial: string, date: Date) => void;
    onPackingFileSelect: (file: File) => void;
    onClearPacking?: () => void;
    onClear: () => void;
    fileName: string;
}

const ITEMS_PER_PAGE = 25;

export function DataTable({
    data,
    headers,
    visibleColumns,
    originalData,
    dataForSummaries,
    packedSerials,
    packedData,
    setPackedData,
    onManualPackedRowAdd,
    onPackingFileSelect,
    onClearPacking,
    onClear,
    fileName
}: DataTableProps) {
    const [selectedRows, setSelectedRows] = React.useState<number[]>([]);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [debouncedSearch, setDebouncedSearch] = React.useState('');
    const [sortColumn, setSortColumn] = React.useState<string | null>(null);
    const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageInputValue, setPageInputValue] = React.useState('1');
    // null = no card filter active; string = filter key
    const [activeCardFilter, setActiveCardFilter] = React.useState<'overdue' | 'due-soon-3' | 'due-soon-7' | 'packed' | null>(null);
    const { toast } = useToast();

    // --- Column Resizing Logic ---
    const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() => {
        if (typeof window === 'undefined') return {};
        const saved = localStorage.getItem('prod-extractor-col-widths');
        return saved ? JSON.parse(saved) : {};
    });
    const [resizingColumn, setResizingColumn] = React.useState<string | null>(null);
    const startX = React.useRef(0);
    const startWidth = React.useRef(0);

    // Shared resize logic (used by both mouse and touch handlers)
    const startResize = (clientX: number, columnId: string) => {
        setResizingColumn(columnId);
        startX.current = clientX;
        startWidth.current = columnWidths[columnId] || 150;
    };

    const updateResize = (clientX: number, columnId: string) => {
        const deltaX = clientX - startX.current;
        const newWidth = Math.max(50, startWidth.current + deltaX);
        setColumnWidths(prev => ({ ...prev, [columnId]: newWidth }));
    };

    const finishResize = () => {
        setResizingColumn(null);
        setColumnWidths(current => {
            localStorage.setItem('prod-extractor-col-widths', JSON.stringify(current));
            return current;
        });
    };

    const handleMouseDown = (e: React.MouseEvent, columnId: string) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(e.pageX, columnId);

        const onMouseMove = (moveEvent: MouseEvent) => updateResize(moveEvent.pageX, columnId);
        const onMouseUp = () => {
            finishResize();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const handleTouchStart = (e: React.TouchEvent, columnId: string) => {
        e.stopPropagation();
        const touch = e.touches[0];
        startResize(touch.pageX, columnId);

        const onTouchMove = (moveEvent: TouchEvent) => {
            moveEvent.preventDefault(); // prevent scroll while resizing
            updateResize(moveEvent.touches[0].pageX, columnId);
        };
        const onTouchEnd = () => {
            finishResize();
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    };

    // Debounce search query by 200ms to avoid re-filtering on every keystroke
    React.useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Add Row State
    const [showAddRow, setShowAddRow] = React.useState(false);
    const [newLinea, setNewLinea] = React.useState('');
    const [newSerial, setNewSerial] = React.useState('');
    const [newDate, setNewDate] = React.useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    });

    const isPackedMode = activeCardFilter === 'packed';
    const currentData = isPackedMode ? (packedData || []) : data;

    const packedHeaders = React.useMemo(() => {
        if (!packedData || packedData.length === 0) return ['Linea', 'Seriales', 'Packed Date'];
        return Object.keys(packedData[0]);
    }, [packedData]);

    const currentHeaders = isPackedMode ? packedHeaders : headers;
    const orderedVisibleColumns = isPackedMode ? currentHeaders : visibleColumns;

    const handleAddManualRow = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSerial.trim() || !setPackedData) return;

        let targetSerialKey = 'Seriales';
        let targetDateKey = 'Packed Date';
        let targetLineaKey = 'Linea';

        if (packedHeaders.length > 0) {
            targetSerialKey = packedHeaders.find(h => h.toLowerCase().includes('serial')) || targetSerialKey;
            targetDateKey = packedHeaders.find(h => h.toLowerCase().includes('date') || h.toLowerCase().includes('fecha')) || targetDateKey;
            targetLineaKey = packedHeaders.find(h => h.toLowerCase() === 'linea' || h.toLowerCase() === 'line') || targetLineaKey;
        }

        const newRow: any = {};
        packedHeaders.forEach(h => newRow[h] = ''); // initialize all to empty
        if (!packedHeaders.includes(targetLineaKey)) packedHeaders.push(targetLineaKey);

        newRow[targetLineaKey] = newLinea.trim();
        newRow[targetSerialKey] = newSerial.trim().toUpperCase();
        newRow[targetDateKey] = newDate ? new Date(newDate + 'T12:00:00') : new Date();

        setPackedData(prev => [newRow, ...prev]);
        if (onManualPackedRowAdd) {
            onManualPackedRowAdd(newRow[targetSerialKey], newRow[targetDateKey]);
        }
        setNewSerial('');
        setNewLinea('');
        setShowAddRow(false);
        toast({ title: "Agregado", description: `Agregado a la tabla temporal.` });
    };

    // Previously we filtered headers to preserve original order. 
    // Now we want to respect the user's custom order in visibleColumns.

    const today = startOfToday();
    const threeDays = addDays(today, 3);
    const sevenDays = addDays(today, 7);

    // Use shared hook for overdue/due-soon classification (eliminates duplicated logic)
    const { overdueCount } = useProductionFilters(data);

    // Filter data based on debounced search query
    const filteredData = React.useMemo(() => {
        if (!currentData) return null;
        if (!debouncedSearch.trim()) return currentData;

        const query = debouncedSearch.toLowerCase();
        return currentData.filter(row =>
            (isPackedMode ? currentHeaders : orderedVisibleColumns).some(col => {
                const value = row[col];
                if (value instanceof Date) {
                    return value.toLocaleDateString().toLowerCase().includes(query);
                }
                return value?.toString()?.toLowerCase().includes(query) ?? false;
            })
        );
    }, [currentData, debouncedSearch, orderedVisibleColumns, isPackedMode, currentHeaders]);

    // Sort filtered data
    const sortedData = React.useMemo(() => {
        if (!filteredData || !sortColumn) return filteredData;

        return [...filteredData].sort((a, b) => {
            const aVal = a[sortColumn];
            const bVal = b[sortColumn];

            if (aVal instanceof Date && bVal instanceof Date) {
                return sortDirection === 'asc'
                    ? aVal.getTime() - bVal.getTime()
                    : bVal.getTime() - aVal.getTime();
            }

            const aStr = aVal?.toString() ?? '';
            const bStr = bVal?.toString() ?? '';

            return sortDirection === 'asc'
                ? aStr.localeCompare(bStr)
                : bStr.localeCompare(aStr);
        });
    }, [filteredData, sortColumn, sortDirection]);

    // Apply card filter on top of sortedData
    const cardFilteredData = React.useMemo(() => {
        if (!sortedData || !activeCardFilter) return sortedData;
        if (activeCardFilter === 'packed') return sortedData; // It's already the packedData
        return sortedData.filter(row => {
            const scheduleDate = row['Schedule Date'];
            if (!(scheduleDate instanceof Date)) return false;
            if (activeCardFilter === 'overdue') return scheduleDate < today;
            if (activeCardFilter === 'due-soon-3') return scheduleDate >= today && scheduleDate <= threeDays;
            if (activeCardFilter === 'due-soon-7') return scheduleDate > threeDays && scheduleDate <= sevenDays;
            return true;
        });
    }, [sortedData, activeCardFilter, packedSerials, today, threeDays, sevenDays]);

    // Paginate data
    const paginatedData = React.useMemo(() => {
        if (!cardFilteredData) return null;
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return cardFilteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [cardFilteredData, currentPage]);

    const totalPages = cardFilteredData ? Math.ceil(cardFilteredData.length / ITEMS_PER_PAGE) : 0;

    React.useEffect(() => {
        setSelectedRows([]);
        setCurrentPage(1);
        setPageInputValue('1');
        setActiveCardFilter(null); // reset card filter when data changes
    }, [data, searchQuery]);

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const handlePackingFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onPackingFileSelect(e.target.files[0]);
            e.target.value = '';
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(paginatedData?.map((_, index) => (currentPage - 1) * ITEMS_PER_PAGE + index) ?? []);
        } else {
            setSelectedRows([]);
        }
    };

    const handleRowSelect = (rowIndex: number) => {
        setSelectedRows(prev =>
            prev.includes(rowIndex)
                ? prev.filter(i => i !== rowIndex)
                : [...prev, rowIndex]
        );
    };

    const handleDownloadReport = () => {
        if (!sortedData || !dataForSummaries || orderedVisibleColumns.length === 0) return;

        const summaryData = sortedData.map(row => {
            let projectedRow: any = {};
            orderedVisibleColumns.forEach(col => {
                projectedRow[col] = row[col];
            });
            return projectedRow;
        });

        const { failedJobs } = downloadReport({
            summaryData: summaryData,
            summaryHeaders: orderedVisibleColumns,
            selectedRowIndices: selectedRows,
            allFilteredData: sortedData,
            originalData: dataForSummaries,
            includeSummary: true,
            packedSerials,
        });

        if (selectedRows.length === 0) {
            toast({
                title: "Summary Downloaded",
                description: "The filtered data summary has been downloaded.",
            });
            return;
        }

        if (failedJobs.length > 0) {
            const totalSelected = selectedRows.length;
            if (failedJobs.length === totalSelected) {
                toast({
                    variant: "destructive",
                    title: "Serial Generation Failed",
                    description: "Could not generate serials for any selected rows due to invalid data. The summary sheet was still downloaded.",
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Partial Download Failure",
                    description: `Serials were generated, but failed for: ${failedJobs.join(', ')}. The full report has been downloaded.`,
                });
            }
        } else {
            toast({
                title: "Report Downloaded",
                description: "The summary and all selected serials have been downloaded successfully.",
            });
        }
    }

    const handleDownloadSerials = () => {
        if (!sortedData || !originalData || selectedRows.length === 0) return;

        const { failedJobs } = downloadReport({
            summaryData: [],
            summaryHeaders: [],
            selectedRowIndices: selectedRows,
            allFilteredData: sortedData,
            originalData: originalData,
            includeSummary: false,
            packedSerials,
        });

        if (failedJobs.length > 0) {
            const totalSelected = selectedRows.length;
            if (failedJobs.length === totalSelected) {
                toast({
                    variant: "destructive",
                    title: "Serial Generation Failed",
                    description: "Could not generate serials for any selected rows.",
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Partial Serial Generation Failure",
                    description: `Serials generation failed for: ${failedJobs.join(', ')}. The rest were downloaded.`,
                });
            }
        } else {
            toast({
                title: "Serials Downloaded",
                description: "The serials for all selected jobs have been downloaded successfully.",
            });
        }
    }

    const allSelected = paginatedData && selectedRows.length === paginatedData.length && paginatedData.length > 0;
    const someSelected = paginatedData && selectedRows.length > 0 && !allSelected;

    const getRowColorClass = (scheduleDate: any) => {
        if (!(scheduleDate instanceof Date)) return "bg-green-50 hover:bg-green-100 data-[state=selected]:bg-green-200";

        const isOverdue = scheduleDate < today;
        const isDueSoon3 = !isOverdue && scheduleDate <= threeDays;
        const isDueSoon7 = !isOverdue && !isDueSoon3 && scheduleDate <= sevenDays;

        if (isOverdue) return "bg-red-100 hover:bg-red-200 data-[state=selected]:bg-red-300";
        if (isDueSoon3) return "bg-orange-100 hover:bg-orange-200 data-[state=selected]:bg-orange-300";
        if (isDueSoon7) return "bg-yellow-50 hover:bg-yellow-100 data-[state=selected]:bg-yellow-200";
        return "bg-green-50 hover:bg-green-100 data-[state=selected]:bg-green-200";
    };

    // --- Risk Prediction Logic ---
    const getRiskInfo = (row: any) => {
        const date = row['Schedule Date'];
        const qty = parseInt(row['Qty Ordered'] || '0', 10);
        if (!date || !(date instanceof Date) || isNaN(qty) || qty === 0) return null;

        const now = new Date();
        const diffTime = date.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Critical if: Already overdue
        if (date < today) return { label: 'Crítico', icon: <Zap className="h-4 text-red-600 animate-pulse" />, color: 'text-red-600' };

        const piecesPerDay = diffDays > 0 ? qty / diffDays : qty;
        // High Risk threshold: more than 250 pieces per day remaining or very close deadline with high qty
        if (piecesPerDay > 250 || (diffDays <= 2 && qty > 100)) {
            return { label: 'Riesgo Alto', icon: <AlertTriangle className="h-4 text-orange-500" />, color: 'text-orange-500' };
        }

        return null;
    };

    const handleDownloadTemplate = () => {
        const ws = xlsx.utils.aoa_to_sheet([["Linea", "Seriales", "Packed Date"]]);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Template");
        xlsx.writeFile(wb, "packing_template.xlsx");
    };
    // --- Enhanced Summary Logic ---
    const summaryStats = React.useMemo(() => {
        // totalJobs uses unfiltered `data` (before search), other stats use search-filtered data
        const totalJobs = data?.length ?? 0;
        const sourceData = filteredData || data || [];

        if (sourceData.length === 0) return { totalJobs, totalPacked: 0, overdueJobs: 0, dueSoon3Jobs: 0, dueSoon7Jobs: 0 };

        let overdueJobs = 0;
        let dueSoon3Jobs = 0;
        let dueSoon7Jobs = 0;

        sourceData.forEach(row => {
            const scheduleDate = row['Schedule Date'];
            if (scheduleDate instanceof Date) {
                if (scheduleDate < today) overdueJobs++;
                else if (scheduleDate <= threeDays) dueSoon3Jobs++;
                else if (scheduleDate <= sevenDays) dueSoon7Jobs++;
            }
        });

        return {
            totalJobs,
            totalPacked: packedSerials.size,
            overdueJobs,
            dueSoon3Jobs,
            dueSoon7Jobs
        };
    }, [filteredData, data, packedSerials, today, threeDays, sevenDays]);

    const handleCopySummary = () => {
        // Helper to formatting list
        const formatJobs = (jobs: any[]) => {
            if (jobs.length === 0) return "N/A";
            return jobs.map(j => `- ${j['Job Number'] ?? 'No Job #'} (${j['Schedule Group'] ?? 'No Group'})`).join('\n');
        };

        const sourceData = filteredData || data || [];

        const overdueList = sourceData.filter(row => {
            const d = row['Schedule Date'];
            return d instanceof Date && d < today;
        });

        const due3DaysList = sourceData.filter(row => {
            const d = row['Schedule Date'];
            return d instanceof Date && d >= today && d <= threeDays;
        });

        const text = `
Resumen de Producción (Filtrado):
----------------------
Total Jobs: ${summaryStats.totalJobs}
Empacados (Global): ${summaryStats.totalPacked}
----------------------
JOB's Vencidos: ${summaryStats.overdueJobs}
LISTA VENCIDOS:
${formatJobs(overdueList)}

JOB's a vencer prox 3 dias: ${summaryStats.dueSoon3Jobs}
LISTA PROX 3 DIAS:
${formatJobs(due3DaysList)}

JOB's a vencer prox 7 dias: ${summaryStats.dueSoon7Jobs}
`.trim();
        navigator.clipboard.writeText(text);
        toast({ title: "Copiado", description: "Resumen detallado copiado al portapapeles." });
    };


    return (
        <div className="space-y-4">
            {/* Enhanced Summary Cards */}
            {data && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
                    {/* Total Jobs — informativo, no filtra */}
                    <Card className="p-3 md:p-4 flex flex-col justify-between shadow-sm">
                        <span className="text-[10px] md:text-xs text-muted-foreground font-medium uppercase">Total Jobs</span>
                        <div className="flex items-center gap-2 mt-1">
                            <TableIcon className="h-4 w-4 text-blue-500" />
                            <span className="text-xl md:text-2xl font-bold">{summaryStats.totalJobs}</span>
                        </div>
                        <span className="text-[9px] text-muted-foreground/70 mt-0.5">sin filtros</span>
                    </Card>

                    {/* Empacados */}
                    {packedSerials.size > 0 && (
                        <Card
                            onClick={() => setActiveCardFilter(f => f === 'packed' ? null : 'packed')}
                            className={cn(
                                "p-3 md:p-4 flex flex-col justify-between shadow-sm border-green-200 bg-green-50/50 dark:bg-green-900/10 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                                activeCardFilter === 'packed' && "ring-2 ring-green-500 shadow-green-200/60 shadow-md"
                            )}
                        >
                            <span className="text-[10px] md:text-xs text-muted-foreground font-medium uppercase">Empacados</span>
                            <div className="flex items-center gap-2 mt-1">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <span className="text-xl md:text-2xl font-bold text-green-700 dark:text-green-400">{summaryStats.totalPacked}</span>
                            </div>
                            <span className="text-[9px] text-green-600/70 mt-0.5">{activeCardFilter === 'packed' ? '▶ filtrando' : 'toca para filtrar'}</span>
                        </Card>
                    )}

                    {/* Vencidos */}
                    <Card
                        onClick={() => setActiveCardFilter(f => f === 'overdue' ? null : 'overdue')}
                        className={cn(
                            "p-3 md:p-4 flex flex-col justify-between shadow-sm border-red-200 bg-red-50/50 dark:bg-red-900/10 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                            activeCardFilter === 'overdue' && "ring-2 ring-red-500 shadow-red-200/60 shadow-md"
                        )}
                    >
                        <span className="text-[10px] md:text-xs text-muted-foreground font-medium uppercase">Vencidos</span>
                        <div className="flex items-center gap-2 mt-1">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            <span className="text-xl md:text-2xl font-bold text-red-700 dark:text-red-400">{summaryStats.overdueJobs}</span>
                        </div>
                        <span className="text-[9px] text-red-600/70 mt-0.5">{activeCardFilter === 'overdue' ? '▶ filtrando' : 'toca para filtrar'}</span>
                    </Card>

                    {/* Próx 3 días */}
                    <Card
                        onClick={() => setActiveCardFilter(f => f === 'due-soon-3' ? null : 'due-soon-3')}
                        className={cn(
                            "p-3 md:p-4 flex flex-col justify-between shadow-sm border-orange-200 bg-orange-50/50 dark:bg-orange-900/10 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                            activeCardFilter === 'due-soon-3' && "ring-2 ring-orange-500 shadow-orange-200/60 shadow-md"
                        )}
                    >
                        <span className="text-[10px] md:text-xs text-muted-foreground font-medium uppercase">Prox. 3 días</span>
                        <div className="flex items-center gap-2 mt-1">
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                            <span className="text-xl md:text-2xl font-bold text-orange-700 dark:text-orange-400">{summaryStats.dueSoon3Jobs}</span>
                        </div>
                        <span className="text-[9px] text-orange-600/70 mt-0.5">{activeCardFilter === 'due-soon-3' ? '▶ filtrando' : 'toca para filtrar'}</span>
                    </Card>

                    {/* Próx 7 días */}
                    <Card
                        onClick={() => setActiveCardFilter(f => f === 'due-soon-7' ? null : 'due-soon-7')}
                        className={cn(
                            "p-3 md:p-4 flex flex-col justify-between shadow-sm border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                            activeCardFilter === 'due-soon-7' && "ring-2 ring-yellow-500 shadow-yellow-200/60 shadow-md"
                        )}
                    >
                        <span className="text-[10px] md:text-xs text-muted-foreground font-medium uppercase">Prox. 7 días</span>
                        <div className="flex items-center gap-2 mt-1">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            <span className="text-xl md:text-2xl font-bold text-yellow-700 dark:text-yellow-400">{summaryStats.dueSoon7Jobs}</span>
                        </div>
                        <span className="text-[9px] text-yellow-600/70 mt-0.5">{activeCardFilter === 'due-soon-7' ? '▶ filtrando' : 'toca para filtrar'}</span>
                    </Card>
                </div>
            )}

            <Card className="h-full">
                <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-6">
                        <div className="space-y-0.5">
                            <CardTitle className="text-base md:text-xl flex items-center gap-2">
                                <TableIcon className="text-accent" />
                                Datos
                                {activeCardFilter && (
                                    <button
                                        onClick={() => setActiveCardFilter(null)}
                                        className="ml-2 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                                    >
                                        ✕ quitar filtro
                                    </button>
                                )}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Acciones rápidas y descarga de reportes.
                            </CardDescription>
                        </div>
                        {data && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:items-center gap-2 w-full lg:w-auto">
                                <Button variant="outline" size="sm" onClick={handleDownloadReport} disabled={(data?.length ?? 0) === 0} title="Descargar Reporte Excel" className="justify-center h-9">
                                    <Download className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                                    Reporte
                                </Button>

                                <Button variant="outline" size="sm" onClick={handleDownloadSerials} disabled={selectedRows.length === 0} title="Descargar Seriales Seleccionados" className="justify-center h-9">
                                    <Download className="mr-2 h-3.5 w-3.5 text-blue-600" />
                                    Serials
                                </Button>

                                <PdfExportButton
                                    data={sortedData || []}
                                    headers={orderedVisibleColumns}
                                    fileName={fileName}
                                    disabled={!sortedData || sortedData.length === 0}
                                />

                                <Button variant="outline" size="sm" onClick={handleCopySummary} title="Copiar Resumen" className="justify-center h-9">
                                    <Copy className="mr-2 h-3.5 w-3.5 text-orange-600" />
                                    Resumen
                                </Button>
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {data === null ? (
                        <div className="text-center text-muted-foreground py-16">
                            <p>Your filtered data will appear here.</p>
                        </div>
                    ) : (
                        <div className='space-y-4'>
                            {/* Analytics Legend & Search Bar */}
                            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-muted/20 p-3 rounded-lg border border-border/50">
                                <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-200 border border-red-400"></div>
                                        <span>Vencido</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-orange-200 border border-orange-400"></div>
                                        <span>3 días</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-100 border border-yellow-400"></div>
                                        <span>7 días</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                                    {isPackedMode && setPackedData && (
                                        <div className="flex items-center">
                                            {showAddRow ? (
                                                <form onSubmit={handleAddManualRow} className="flex items-center gap-1 bg-background p-1 rounded shadow-sm border border-primary/20 text-xs">
                                                    <Input type="text" placeholder="Línea" value={newLinea} onChange={e=>setNewLinea(e.target.value)} className="h-7 w-20 md:w-24 text-xs" />
                                                    <Input type="text" placeholder="Serial" value={newSerial} onChange={e=>setNewSerial(e.target.value)} className="h-7 w-28 md:w-32 text-xs" autoFocus />
                                                    <Input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} className="h-7 w-28 md:w-32 text-xs" />
                                                    <Button type="submit" size="sm" className="h-7 px-2">Añadir</Button>
                                                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={()=>setShowAddRow(false)}>✕</Button>
                                                </form>
                                            ) : (
                                                <Button size="sm" variant="outline" onClick={() => setShowAddRow(true)} className="h-8 text-xs whitespace-nowrap bg-background">
                                                    + Fila Manual
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                    <div className="relative flex-1 md:w-64 min-w-[150px]">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            placeholder="Buscar en resultados..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-9 h-8 text-xs bg-background"
                                        />
                                    </div>
                                    <div className="text-[11px] font-bold bg-background border px-2 py-1 rounded shadow-sm whitespace-nowrap">
                                        {sortedData?.length ?? 0} ITEMS {selectedRows.length > 0 && <span className="text-primary">({selectedRows.length} SEL)</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Table */}
                            <ScrollArea className="h-[55vh] md:h-[50vh] rounded-md border relative bg-white">
                                <table className="w-full caption-bottom text-sm text-gray-700 table-fixed">
                                    <TableHeader className="sticky top-0 bg-gray-100 z-10 shadow-sm text-gray-800">
                                        <TableRow>
                                            <TableHead className="w-6 px-0 shrink-0 text-center">
                                                <Checkbox
                                                    checked={allSelected ? true : (someSelected ? 'indeterminate' : false)}
                                                    onCheckedChange={handleSelectAll}
                                                    disabled={!paginatedData || paginatedData.length === 0}
                                                    aria-label="Select all rows"
                                                />
                                            </TableHead>
                                            <TableHead className="w-4 px-0 shrink-0 text-center text-[10px]" title="Riesgo de Atraso">⚡</TableHead>
                                            {orderedVisibleColumns.map((header) => (
                                                <TableHead
                                                    key={header}
                                                    style={{ width: columnWidths[header] || 150 }}
                                                    className="relative cursor-pointer hover:bg-gray-200 transition-colors group p-0"
                                                >
                                                    <div
                                                        className="flex items-center gap-1 px-4 py-3 h-full truncate"
                                                        onClick={() => handleSort(header)}
                                                    >
                                                        <span className="truncate flex-1">{header}</span>
                                                        <ArrowUpDown className={cn(
                                                            "h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100",
                                                            sortColumn === header ? "text-primary opacity-100" : "text-gray-400"
                                                        )} />
                                                    </div>
                                                    {/* Resizer Handle — mouse + touch */}
                                                    <div
                                                        onMouseDown={(e) => handleMouseDown(e, header)}
                                                        onTouchStart={(e) => handleTouchStart(e, header)}
                                                        className={cn(
                                                            "absolute right-0 top-0 h-full w-2 md:w-1 border-r border-transparent cursor-col-resize hover:border-primary hover:bg-primary/20 transition-all z-20 touch-none",
                                                            resizingColumn === header && "border-primary bg-primary/30 w-2"
                                                        )}
                                                    />
                                                </TableHead>
                                            ))}
                                            {packedSerials.size > 0 && (
                                                <TableHead
                                                    style={{ width: columnWidths['__packed'] || 140 }}
                                                    className="relative whitespace-nowrap text-emerald-700 bg-emerald-50 p-0 group"
                                                    title="Seriales empacados de este job"
                                                >
                                                    <div className="flex items-center gap-1 px-4 py-3 h-full truncate">
                                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="truncate">Empacados</span>
                                                    </div>
                                                    <div
                                                        onMouseDown={(e) => handleMouseDown(e, '__packed')}
                                                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-emerald-400/50 z-20"
                                                    />
                                                </TableHead>
                                            )}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedData && paginatedData.length > 0 ? paginatedData.map((row, pageIndex) => {
                                            const actualIndex = (currentPage - 1) * ITEMS_PER_PAGE + pageIndex;
                                            const scheduleDate = row['Schedule Date'];

                                            return (
                                                <TableRow
                                                    key={actualIndex}
                                                    data-state={selectedRows.includes(actualIndex) ? 'selected' : ''}
                                                    className={getRowColorClass(scheduleDate)}
                                                >
                                                    <TableCell className="px-0 w-6 text-center">
                                                        <Checkbox
                                                            checked={selectedRows.includes(actualIndex)}
                                                            onCheckedChange={() => handleRowSelect(actualIndex)}
                                                            aria-label={`Select row ${actualIndex + 1}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="px-0 w-4 text-center">
                                                        {getRiskInfo(row)?.icon}
                                                    </TableCell>
                                                    {orderedVisibleColumns.map((header) => {
                                                        const val = row[header];
                                                        const cellText = val instanceof Date
                                                            ? val.toLocaleDateString()
                                                            : (val?.toString() ?? '');
                                                        return (
                                                            <TableCell key={header} className="truncate">
                                                                <HighlightText text={cellText} term={debouncedSearch} />
                                                            </TableCell>
                                                        );
                                                    })}
                                                    {packedSerials.size > 0 && (() => {
                                                        const { packed, total } = countPackedForRow(row, packedSerials);
                                                        const pct = total > 0 ? Math.round((packed / total) * 100) : 0;
                                                        const isComplete = pct === 100;
                                                        const barColor = isComplete
                                                            ? 'bg-emerald-500'
                                                            : pct > 0
                                                                ? 'bg-blue-400'
                                                                : 'bg-gray-200';
                                                        return (
                                                            <TableCell className="bg-emerald-50/60 truncate">
                                                                <div
                                                                    title={`${packed} de ${total} empacados (${pct}%)`}
                                                                    className="flex items-center gap-2 cursor-default"
                                                                >
                                                                    {/* Mini progress bar */}
                                                                    <div className="relative w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden shrink-0">
                                                                        <div
                                                                            className={cn('absolute left-0 top-0 h-full rounded-full transition-all', barColor)}
                                                                            style={{ width: `${pct}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className={cn(
                                                                        'text-[11px] font-semibold tabular-nums truncate',
                                                                        isComplete ? 'text-emerald-700' : packed > 0 ? 'text-blue-700' : 'text-gray-400'
                                                                    )}>
                                                                        {packed}/{total}
                                                                    </span>
                                                                </div>
                                                            </TableCell>
                                                        );
                                                    })()}
                                                </TableRow>
                                            )
                                        }) : (
                                            <TableRow>
                                                <TableCell colSpan={orderedVisibleColumns.length + 3} className="h-24 text-center">
                                                    No results.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </table>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <p className="text-xs md:text-sm text-muted-foreground">
                                        Página {currentPage} de {totalPages}
                                    </p>
                                    <div className="flex items-center gap-1">
                                        {/* Primera página — solo en sm+ */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setCurrentPage(1); setPageInputValue('1'); }}
                                            disabled={currentPage === 1}
                                            title="Primera página"
                                            className="hidden sm:flex"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            <ChevronLeft className="h-4 w-4 -ml-3" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { const p = Math.max(1, currentPage - 1); setCurrentPage(p); setPageInputValue(String(p)); }}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            <span className="hidden sm:inline">Anterior</span>
                                        </Button>
                                        <div className="flex items-center gap-1 mx-1">
                                            <Input
                                                type="number"
                                                min={1}
                                                max={totalPages}
                                                value={pageInputValue}
                                                onChange={(e) => setPageInputValue(e.target.value)}
                                                onBlur={() => {
                                                    const p = Math.min(totalPages, Math.max(1, parseInt(pageInputValue) || 1));
                                                    setCurrentPage(p);
                                                    setPageInputValue(String(p));
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const p = Math.min(totalPages, Math.max(1, parseInt(pageInputValue) || 1));
                                                        setCurrentPage(p);
                                                        setPageInputValue(String(p));
                                                    }
                                                }}
                                                className="w-12 md:w-14 h-9 text-xs text-center"
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { const p = Math.min(totalPages, currentPage + 1); setCurrentPage(p); setPageInputValue(String(p)); }}
                                            disabled={currentPage === totalPages}
                                        >
                                            <span className="hidden sm:inline">Siguiente</span>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                        {/* Última página — solo en sm+ */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setCurrentPage(totalPages); setPageInputValue(String(totalPages)); }}
                                            disabled={currentPage === totalPages}
                                            title="Última página"
                                            className="hidden sm:flex"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                            <ChevronRight className="h-4 w-4 -ml-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
