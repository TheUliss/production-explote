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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, TableIcon } from 'lucide-react';
import { downloadReport } from '@/lib/xlsx-utils';
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from './ui/checkbox';
import { cn } from '@/lib/utils';
import { addDays, startOfToday } from 'date-fns';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

interface DataTableProps {
    data: any[] | null;
    headers: string[];
    visibleColumns: string[];
    originalData: any[] | null;
    dataForSummaries: any[] | null;
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
    const [sortColumn, setSortColumn] = React.useState<string | null>(null);
    const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = React.useState(1);
    const { toast } = useToast();

    const orderedVisibleColumns = headers.filter(h => visibleColumns.includes(h));

    const today = startOfToday();
    const threeDays = addDays(today, 3);
    const sevenDays = addDays(today, 7);

    // Count overdue items for alert
    const overdueCount = React.useMemo(() => {
        if (!data) return 0;
        return data.filter(row => {
            const scheduleDate = row['Schedule Date'];
            return scheduleDate instanceof Date && scheduleDate < today;
        }).length;
    }, [data, today]);

    // Filter data based on search query
    const filteredData = React.useMemo(() => {
        if (!data) return null;
        if (!searchQuery.trim()) return data;

        const query = searchQuery.toLowerCase();
        return data.filter(row =>
            orderedVisibleColumns.some(col => {
                const value = row[col];
                if (value instanceof Date) {
                    return value.toLocaleDateString().toLowerCase().includes(query);
                }
                return value?.toString().toLowerCase().includes(query);
            })
        );
    }, [data, searchQuery, orderedVisibleColumns]);

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

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                    <TableIcon className="text-accent" />
                    Filtered Data
                </CardTitle>
                <CardDescription>
                    The data below is filtered based on your configuration. Select rows to generate and download serials.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {data === null ? (
                    <div className="text-center text-muted-foreground py-16">
                        <p>Your filtered data will appear here.</p>
                    </div>
                ) : (
                    <div className='space-y-4'>
                        {/* Overdue Alert */}
                        {overdueCount > 0 && (
                            <Alert variant="destructive" className="border-red-500 bg-red-50">
                                <AlertTriangle className="h-5 w-5" />
                                <AlertTitle className="text-red-800 font-bold">¡Atención! Items Vencidos</AlertTitle>
                                <AlertDescription className="text-red-700">
                                    Hay <span className="font-bold">{overdueCount}</span> item{overdueCount > 1 ? 's' : ''} con fecha vencida que requieren atención inmediata.
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Color Legend */}
                        <div className="flex flex-wrap gap-4 p-3 border rounded-md bg-card">
                            <span className="text-sm font-medium text-muted-foreground">Leyenda:</span>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded bg-red-200 border border-red-400"></div>
                                <span className="text-sm">Vencido</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded bg-orange-200 border border-orange-400"></div>
                                <span className="text-sm">Vence en 3 días</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-400"></div>
                                <span className="text-sm">Vence en 7 días</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded bg-green-100 border border-green-400"></div>
                                <span className="text-sm">A tiempo</span>
                            </div>
                        </div>

                        {/* File Management & Packing Data */}
                        <div className="border rounded-md p-4 space-y-3 bg-card">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold">Archivo Cargado</h4>
                                <Button variant="outline" size="sm" onClick={onClear}>
                                    <Search className="mr-2 h-4 w-4" />
                                    Nuevo Archivo
                                </Button>
                            </div>
                            <p className="text-sm text-muted-foreground truncate" title={fileName}>
                                📄 {fileName}
                            </p>
                            <div className="border-t pt-3 mt-3">
                                <h4 className="font-semibold mb-2">Datos de Empaque</h4>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Sube un archivo con seriales empacados. Debe contener una columna "Seriales".
                                </p>
                                <Input
                                    id="packing-file"
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={handlePackingFileUpload}
                                    className="max-w-sm file:text-primary file:font-semibold"
                                />
                                {packedSerials.size > 0 &&
                                    <p className="text-sm text-green-500 font-medium mt-2">
                                        {packedSerials.size} seriales empacados cargados.
                                    </p>
                                }
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Buscar en la tabla..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        {/* Stats and Download Buttons */}
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-muted-foreground">
                                {sortedData?.length ?? 0} row{(sortedData?.length ?? 0) === 1 ? '' : 's'} found. {selectedRows.length > 0 && `(${selectedRows.length} selected)`}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button onClick={handleDownloadReport} disabled={(sortedData?.length ?? 0) === 0 || orderedVisibleColumns.length === 0}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download Report
                                </Button>
                                <Button onClick={handleDownloadSerials} variant="secondary" disabled={selectedRows.length === 0}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download Serials
                                </Button>
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
                                                {orderedVisibleColumns.map((header) => (
                                                    <TableCell key={header}>
                                                        {row[header] instanceof Date ? row[header].toLocaleDateString() : (row[header]?.toString() ?? '')}
                                                    </TableCell>
                                                ))}
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
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Página {currentPage} de {totalPages}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Anterior
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Siguiente
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
