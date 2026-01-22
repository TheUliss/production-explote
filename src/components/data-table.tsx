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
import { Download, Sparkles, TableIcon } from 'lucide-react';
import { downloadDataAsXLSX, downloadSerialsAsXLSX } from '@/lib/xlsx-utils';
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { useToast } from '@/hooks/use-toast';

interface DataTableProps {
  data: any[] | null;
  headers: string[];
  visibleColumns: string[];
}

export function DataTable({ data, headers, visibleColumns }: DataTableProps) {
  const [selectedRowIndex, setSelectedRowIndex] = React.useState<string | null>(null);
  const { toast } = useToast();
    
  // Ensure the columns in the table and download are in the correct order.
  const orderedVisibleColumns = headers.filter(h => visibleColumns.includes(h));

  const handleDownload = () => {
    if (data && orderedVisibleColumns.length > 0) {
      // The data is already filtered, we just need to pick the visible columns
      const dataToDownload = data.map(row => {
        let projectedRow: any = {};
        orderedVisibleColumns.forEach(col => {
          projectedRow[col] = row[col];
        });
        return projectedRow;
      });
      // The second argument to downloadDataAsXLSX sets the header order.
      downloadDataAsXLSX(dataToDownload, orderedVisibleColumns);
    }
  }
  
  const handleGenerateSerials = () => {
    if (selectedRowIndex === null || !data) {
        toast({
            variant: "destructive",
            title: "No row selected",
            description: "Please select a row to generate serials.",
        });
        return;
    }
    const selectedRow = data[parseInt(selectedRowIndex, 10)];
    
    const success = downloadSerialsAsXLSX(selectedRow);

    if (!success) {
        toast({
            variant: "destructive",
            title: "Invalid Data",
            description: "The selected row is missing a valid 'Job Number', 'Schedule Date', or 'Qty Ordered'.",
        });
    }
  }

  const selectedRow = selectedRowIndex !== null && data ? data[parseInt(selectedRowIndex, 10)] : null;
  
  return (
     <Card className="h-full">
        <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
                <TableIcon className="text-accent"/>
                Filtered Data
            </CardTitle>
            <CardDescription>
                The data below is filtered based on your configuration. Select a row to generate serials.
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
                            {data.length} row{data.length === 1 ? '' : 's'} found.
                        </p>
                        <div className="flex items-center gap-2">
                             <Button onClick={handleGenerateSerials} disabled={!selectedRow}>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Generate Serials
                            </Button>
                            <Button onClick={handleDownload} disabled={data.length === 0 || orderedVisibleColumns.length === 0}>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                            </Button>
                        </div>
                    </div>
                     <ScrollArea className="h-[60vh] rounded-md border relative">
                        <RadioGroup value={selectedRowIndex ?? ''} onValueChange={setSelectedRowIndex} className="w-full">
                            <table className="w-full caption-bottom text-sm">
                                <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead className="w-12 px-4"></TableHead>
                                    {orderedVisibleColumns.map((header) => (
                                    <TableHead key={header}>{header}</TableHead>
                                    ))}
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {data.length > 0 ? data.map((row, rowIndex) => (
                                    <TableRow key={rowIndex} data-state={selectedRowIndex === rowIndex.toString() ? 'selected' : ''}>
                                        <TableCell className="px-4">
                                            <RadioGroupItem value={rowIndex.toString()} id={`r${rowIndex}`} />
                                        </TableCell>
                                        {orderedVisibleColumns.map((header) => (
                                            <TableCell key={header}>
                                                {row[header] instanceof Date ? row[header].toLocaleDateString() : (row[header]?.toString() ?? '')}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={orderedVisibleColumns.length + 1} className="h-24 text-center">
                                            No results.
                                        </TableCell>
                                    </TableRow>
                                )}
                                </TableBody>
                            </table>
                        </RadioGroup>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </div>
            )}
        </CardContent>
    </Card>
  );
}
