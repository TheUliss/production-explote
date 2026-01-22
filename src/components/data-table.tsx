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
import { Download, TableIcon } from 'lucide-react';
import { downloadReport } from '@/lib/xlsx-utils';
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from './ui/checkbox';
import { cn } from '@/lib/utils';
import { startOfToday } from 'date-fns';

interface DataTableProps {
  data: any[] | null;
  headers: string[];
  visibleColumns: string[];
}

export function DataTable({ data, headers, visibleColumns }: DataTableProps) {
  const [selectedRows, setSelectedRows] = React.useState<number[]>([]);
  const { toast } = useToast();
    
  const orderedVisibleColumns = headers.filter(h => visibleColumns.includes(h));
  
  React.useEffect(() => {
    setSelectedRows([]);
  }, [data]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(data?.map((_, index) => index) ?? []);
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

  const handleDownload = () => {
    if (!data || orderedVisibleColumns.length === 0) {
        return;
    }

    const summaryData = data.map(row => {
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
        allFilteredData: data,
    });

    if (failedJobs.length > 0) {
        const totalSelected = selectedRows.length;
        if (failedJobs.length === totalSelected) {
            toast({
                variant: "destructive",
                title: "Serial Generation Failed",
                description: "Could not generate serials. All selected rows have invalid data.",
            });
        } else {
            toast({
                variant: "destructive",
                title: "Partial Serial Generation Failure",
                description: `Could not generate serials for some jobs due to invalid data: ${failedJobs.join(', ')}. The report has been downloaded.`,
            });
        }
    } else if (selectedRows.length > 0) {
        toast({
            title: "Report Downloaded",
            description: "The summary and selected serials have been downloaded.",
        });
    }
  }
  
  const allSelected = data && selectedRows.length === data.length && data.length > 0;
  const someSelected = data && selectedRows.length > 0 && !allSelected;
  const today = startOfToday();

  return (
     <Card className="h-full">
        <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
                <TableIcon className="text-accent"/>
                Filtered Data
            </CardTitle>
            <CardDescription>
                The data below is filtered based on your configuration. Select rows to generate and download serials. Overdue items are highlighted.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {data === null ? (
                <div className="text-center text-muted-foreground py-16">
                    <p>Your filtered data will appear here.</p>
                </div>
            ) : (
                <div className='space-y-4'>
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">
                            {data.length} row{data.length === 1 ? '' : 's'} found. {selectedRows.length > 0 && `(${selectedRows.length} selected)`}
                        </p>
                        <div className="flex items-center gap-2">
                             <Button onClick={handleDownload} disabled={data.length === 0 || orderedVisibleColumns.length === 0}>
                                <Download className="mr-2 h-4 w-4" />
                                {selectedRows.length > 0 ? `Download Report (${selectedRows.length} serials)` : 'Download Summary'}
                            </Button>
                        </div>
                    </div>
                     <ScrollArea className="h-[60vh] rounded-md border relative">
                        <table className="w-full caption-bottom text-sm">
                            <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                <TableHead className="w-12 px-4">
                                  <Checkbox
                                    checked={allSelected ? true : (someSelected ? 'indeterminate' : false)}
                                    onCheckedChange={handleSelectAll}
                                    disabled={!data || data.length === 0}
                                    aria-label="Select all rows"
                                  />
                                </TableHead>
                                {orderedVisibleColumns.map((header) => (
                                <TableHead key={header}>{header}</TableHead>
                                ))}
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {data.length > 0 ? data.map((row, rowIndex) => {
                                const scheduleDate = row['Schedule Date'];
                                const isOverdue = scheduleDate instanceof Date && scheduleDate < today;
                                return (
                                <TableRow key={rowIndex} data-state={selectedRows.includes(rowIndex) ? 'selected' : ''} className={cn(isOverdue && "bg-destructive/20 hover:bg-destructive/30 data-[state=selected]:bg-destructive/40")}>
                                    <TableCell className="px-4">
                                        <Checkbox
                                          checked={selectedRows.includes(rowIndex)}
                                          onCheckedChange={() => handleRowSelect(rowIndex)}
                                          aria-label={`Select row ${rowIndex + 1}`}
                                        />
                                    </TableCell>
                                    {orderedVisibleColumns.map((header) => (
                                        <TableCell key={header}>
                                            {row[header] instanceof Date ? row[header].toLocaleDateString() : (row[header]?.toString() ?? '')}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            )}) : (
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
                </div>
            )}
        </CardContent>
    </Card>
  );
}
