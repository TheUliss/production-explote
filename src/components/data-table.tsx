'use client';

import * as React from 'react';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Download, TableIcon } from 'lucide-react';
import { downloadDataAsXLSX } from '@/lib/xlsx-utils';
import { ScrollArea } from './ui/scroll-area';

interface DataTableProps {
  data: any[] | null;
  headers: string[]; // This has the master order
  visibleColumns: string[];
}

export function DataTable({ data, headers, visibleColumns }: DataTableProps) {
    
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
  
  return (
     <Card className="h-full">
        <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
                <TableIcon className="text-accent"/>
                Filtered Data
            </CardTitle>
            <CardDescription>
                The data below is filtered based on your configuration.
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
                        <Button onClick={handleDownload} disabled={data.length === 0 || orderedVisibleColumns.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                        </Button>
                    </div>
                     <ScrollArea className="h-[60vh] rounded-md border relative">
                        <table className="w-full caption-bottom text-sm">
                            <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                {orderedVisibleColumns.map((header) => (
                                <TableHead key={header}>{header}</TableHead>
                                ))}
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {data.length > 0 ? data.map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                {orderedVisibleColumns.map((header) => (
                                    <TableCell key={header}>
                                        {row[header] instanceof Date ? row[header].toLocaleDateString() : (row[header]?.toString() ?? '')}
                                    </TableCell>
                                ))}
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={orderedVisibleColumns.length} className="h-24 text-center">
                                        No results.
                                    </TableCell>
                                </TableRow>
                            )}
                            </TableBody>
                        </table>
                    </ScrollArea>
                </div>
            )}
        </CardContent>
    </Card>
  );
}
