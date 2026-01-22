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
import { downloadDataAsXLSX } from '@/lib/xlsx-utils';
import { ScrollArea } from './ui/scroll-area';

interface DataTableProps {
  data: any[] | null;
  headers: string[];
  visibleColumns: string[];
}

export function DataTable({ data, headers, visibleColumns }: DataTableProps) {
    
  const handleDownload = () => {
    if (data && visibleColumns.length > 0) {
      const dataToDownload = data.map(row => {
        let projectedRow: any = {};
        visibleColumns.forEach(col => {
          projectedRow[col] = row[col];
        });
        return projectedRow;
      });
      downloadDataAsXLSX(dataToDownload, visibleColumns);
    }
  }
  
  const displayableColumns = headers.filter(h => visibleColumns.includes(h));

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
                        <Button onClick={handleDownload} disabled={data.length === 0 || visibleColumns.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                        </Button>
                    </div>
                     <ScrollArea className="h-[60vh] rounded-md border relative">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                {displayableColumns.map((header) => (
                                <TableHead key={header}>{header}</TableHead>
                                ))}
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {data.length > 0 ? data.map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                {displayableColumns.map((header) => (
                                    <TableCell key={header}>
                                        {row[header] instanceof Date ? row[header].toLocaleDateString() : (row[header]?.toString() ?? '')}
                                    </TableCell>
                                ))}
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={displayableColumns.length} className="h-24 text-center">
                                        No results.
                                    </TableCell>
                                </TableRow>
                            )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </div>
            )}
        </CardContent>
    </Card>
  );
}
