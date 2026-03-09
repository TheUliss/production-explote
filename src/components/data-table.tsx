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
    onPackingFileSelect: (file: File) => void;
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
    onPackingFileSelect,
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
    const { toast } = useToast();

    // Debounce search query by 200ms to avoid re-filtering on every keystroke
    React.useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Previously we filtered headers to preserve original order. 
    // Now we want to respect the user's custom order in visibleColumns.
    const orderedVisibleColumns = visibleColumns;

    const today = startOfToday();
    const threeDays = addDays(today, 3);
    const sevenDays = addDays(today, 7);

    // Use shared hook for overdue/due-soon classification (eliminates duplicated logic)
    const { overdueCount } = useProductionFilters(data);

    // Filter data based on debounced search query
    const filteredData = React.useMemo(() => {
        if (!data) return null;
        if (!debouncedSearch.trim()) return data;

        const query = debouncedSearch.toLowerCase();
        return data.filter(row =>
            orderedVisibleColumns.some(col => {
                const value = row[col];
                if (value instanceof Date) {
                    return value.toLocaleDateString().toLowerCase().includes(query);
                }
                return value?.toString()?.toLowerCase().includes(query) ?? false;
            })
        );
    }, [data, debouncedSearch, orderedVisibleColumns]);

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

    // Paginate data
    const paginatedData = React.useMemo(() => {
        if (!sortedData) return null;
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [sortedData, currentPage]);

    const totalPages = sortedData ? Math.ceil(sortedData.length / ITEMS_PER_PAGE) : 0;

    React.useEffect(() => {
        setSelectedRows([]);
        setCurrentPage(1);
        setPageInputValue('1');
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
        // Use filteredData (which reflects search) or fallback to data (which reflects parent filters)
        // If filteredData is null initially (before search logic runs?), use data. 
        // Actually filteredData is initialized in useMemo from data.
        const sourceData = filteredData || data || [];

        if (sourceData.length === 0) return { totalJobs: 0, totalPacked: 0, overdueJobs: 0, dueSoon3Jobs: 0, dueSoon7Jobs: 0 };

        let totalJobs = sourceData.length;
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

        // "Total Packed" remains as the global count of scanned serials (contextual info)
        // It is NOT filtered by the view because packed items are a separate list loaded.

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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <Card className="p-4 flex flex-col justify-between shadow-sm">
                        <span className="text-xs text-muted-foreground font-medium uppercase">Total Jobs</span>
                        <div className="flex items-center gap-2 mt-1">
                            <TableIcon className="h-4 w-4 text-blue-500" />
                            <span className="text-2xl font-bold">{summaryStats.totalJobs}</span>
                        </div>
                    </Card>
                    {packedSerials.size > 0 && (
                        <Card className="p-4 flex flex-col justify-between shadow-sm border-green-200 bg-green-50/50 dark:bg-green-900/10">
                            <span className="text-xs text-muted-foreground font-medium uppercase">Empacados</span>
                            <div className="flex items-center gap-2 mt-1">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <span className="text-2xl font-bold text-green-700 dark:text-green-400">{summaryStats.totalPacked}</span>
                            </div>
                        </Card>
                    )}
                    <Card className="p-4 flex flex-col justify-between shadow-sm border-red-200 bg-red-50/50 dark:bg-red-900/10">
                        <span className="text-xs text-muted-foreground font-medium uppercase">JOB's Vencidos</span>
                        <div className="flex items-center gap-2 mt-1">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            <span className="text-2xl font-bold text-red-700 dark:text-red-400">{summaryStats.overdueJobs}</span>
                        </div>
                    </Card>
                    <Card className="p-4 flex flex-col justify-between shadow-sm border-orange-200 bg-orange-50/50 dark:bg-orange-900/10">
                        <span className="text-xs text-muted-foreground font-medium uppercase">JOB's a vencer prox 3 dias</span>
                        <div className="flex items-center gap-2 mt-1">
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                            <span className="text-2xl font-bold text-orange-700 dark:text-orange-400">{summaryStats.dueSoon3Jobs}</span>
                        </div>
                    </Card>
                    <Card className="p-4 flex flex-col justify-between shadow-sm border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10">
                        <span className="text-xs text-muted-foreground font-medium uppercase">JOB's a vencer prox 7 dias</span>
                        <div className="flex items-center gap-2 mt-1">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            <span className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{summaryStats.dueSoon7Jobs}</span>
                        </div>
                    </Card>
                </div>
            )}

            <Card className="h-full">
                <CardHeader className="pb-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="space-y-1">
                            <CardTitle className="text-xl flex items-center gap-2">
                                <TableIcon className="text-accent" />
                                Filtered Data
                            </CardTitle>
                            <CardDescription>
                                Acciones rápidas y descarga de reportes.
                            </CardDescription>
                        </div>
                        {data && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:items-center gap-2 w-full lg:w-auto">
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

                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <div className="relative flex-1 md:w-64">
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
                            <ScrollArea className="h-[50vh] rounded-md border relative bg-white">
                                <table className="w-full caption-bottom text-sm text-gray-700">
                                    <TableHeader className="sticky top-0 bg-gray-100 z-10 shadow-sm text-gray-800">
                                        <TableRow>
                                            <TableHead className="w-12 px-4">
                                                <Checkbox
                                                    checked={allSelected ? true : (someSelected ? 'indeterminate' : false)}
                                                    onCheckedChange={handleSelectAll}
                                                    disabled={!paginatedData || paginatedData.length === 0}
                                                    aria-label="Select all rows"
                                                />
                                            </TableHead>
                                            <TableHead className="w-10 px-0" title="Riesgo de Atraso">Risk</TableHead>
                                            {orderedVisibleColumns.map((header) => (
                                                <TableHead
                                                    key={header}
                                                    className={cn(
                                                        "cursor-pointer hover:bg-gray-200 transition-colors whitespace-nowrap",
                                                        header === 'Item Description' && 'min-w-[300px]'
                                                    )}
                                                    onClick={() => handleSort(header)}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        {header}
                                                        <ArrowUpDown className={cn(
                                                            "h-4 w-4 shrink-0",
                                                            sortColumn === header ? "text-primary" : "text-gray-400"
                                                        )} />
                                                    </div>
                                                </TableHead>
                                            ))}
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
                                                    <TableCell className="px-4">
                                                        <Checkbox
                                                            checked={selectedRows.includes(actualIndex)}
                                                            onCheckedChange={() => handleRowSelect(actualIndex)}
                                                            aria-label={`Select row ${actualIndex + 1}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="px-1 text-center">
                                                        {getRiskInfo(row)?.icon}
                                                    </TableCell>
                                                    {orderedVisibleColumns.map((header) => {
                                                        const val = row[header];
                                                        const cellText = val instanceof Date
                                                            ? val.toLocaleDateString()
                                                            : (val?.toString() ?? '');
                                                        return (
                                                            <TableCell key={header}>
                                                                <HighlightText text={cellText} term={debouncedSearch} />
                                                            </TableCell>
                                                        );
                                                    })}
                                                </TableRow>
                                            )
                                        }) : (
                                            <TableRow>
                                                <TableCell colSpan={orderedVisibleColumns.length + 1} className="h-24 text-center">
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
                                    <p className="text-sm text-muted-foreground">
                                        Página {currentPage} de {totalPages}
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setCurrentPage(1); setPageInputValue('1'); }}
                                            disabled={currentPage === 1}
                                            title="Primera página"
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
                                            Anterior
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
                                                className="w-14 h-8 text-xs text-center"
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { const p = Math.min(totalPages, currentPage + 1); setCurrentPage(p); setPageInputValue(String(p)); }}
                                            disabled={currentPage === totalPages}
                                        >
                                            Siguiente
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setCurrentPage(totalPages); setPageInputValue(String(totalPages)); }}
                                            disabled={currentPage === totalPages}
                                            title="Última página"
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
