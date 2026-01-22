'use client';

import type { ConstantFilter } from './excel-insights-page';
import type { DateRange } from 'react-day-picker';
import { Button } from './ui/button';
import { Calendar } from './ui/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';
import { add, format } from 'date-fns';
import { CalendarIcon, Columns, Filter, Loader2, MinusCircle, PlusCircle, Trash2, X } from 'lucide-react';
import * as React from 'react';

interface ConfigPanelProps {
  fileName: string;
  headers: string[];
  selectedColumns: string[];
  setSelectedColumns: (columns: string[]) => void;
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  dateColumn: string;
  setDateColumn: (column: string) => void;
  constantFilters: ConstantFilter[];
  setConstantFilters: React.Dispatch<React.SetStateAction<ConstantFilter[]>>;
  onGenerate: () => void;
  onClear: () => void;
  isLoading: boolean;
}

export function ConfigPanel({
  fileName,
  headers,
  selectedColumns,
  setSelectedColumns,
  dateRange,
  setDateRange,
  dateColumn,
  setDateColumn,
  constantFilters,
  setConstantFilters,
  onGenerate,
  onClear,
  isLoading,
}: ConfigPanelProps) {

  const handleSelectAllColumns = (checked: boolean) => {
    setSelectedColumns(checked ? headers : []);
  };

  const handleColumnChange = (column: string) => {
    setSelectedColumns(
      selectedColumns.includes(column)
        ? selectedColumns.filter((c) => c !== column)
        : [...selectedColumns, column]
    );
  };
  
  const addConstantFilter = () => {
    setConstantFilters([...constantFilters, { id: Date.now().toString(), column: '', value: '' }]);
  };

  const updateConstantFilter = (id: string, key: 'column' | 'value', value: string) => {
    setConstantFilters(constantFilters.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const removeConstantFilter = (id: string) => {
    setConstantFilters(constantFilters.filter(f => f.id !== id));
  };

  return (
    <Card className="sticky top-6">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-xl">Configuration</CardTitle>
          <CardDescription className="truncate" title={fileName}>{fileName}</CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 -mt-2 -mr-2" onClick={onClear}>
            <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-base font-medium flex items-center gap-2"><Columns/> Columns to Summarize</Label>
          <Separator className="my-2" />
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox
              id="select-all"
              checked={selectedColumns.length === headers.length}
              onCheckedChange={handleSelectAllColumns}
            />
            <Label htmlFor="select-all" className="font-medium">Select All</Label>
          </div>
          <ScrollArea className="h-40 rounded-md border p-2">
            {headers.map((header) => (
              <div key={header} className="flex items-center space-x-2 p-1">
                <Checkbox
                  id={header}
                  checked={selectedColumns.includes(header)}
                  onCheckedChange={() => handleColumnChange(header)}
                />
                <Label htmlFor={header} className="font-normal w-full truncate" title={header}>{header}</Label>
              </div>
            ))}
          </ScrollArea>
        </div>
        
        <div className="space-y-2">
          <Label className="text-base font-medium flex items-center gap-2"><Filter/> Filters</Label>
          <Separator className="my-2" />
          
          {/* Date Range Filter */}
          <div className='space-y-2 rounded-md border p-3'>
            <Label>Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={dateColumn} onValueChange={setDateColumn}>
                <SelectTrigger>
                  <SelectValue placeholder="Select date column" />
                </SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "justify-start text-left font-normal",
                      !dateRange && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          {/* Constant Filters */}
          <div className='space-y-2 rounded-md border p-3'>
             <div className="flex items-center justify-between">
                <Label>Constant Values</Label>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addConstantFilter}>
                    <PlusCircle className="h-4 w-4" />
                </Button>
            </div>
            {constantFilters.map((filter, index) => (
                <div key={filter.id} className="flex items-center gap-2">
                    <Select value={filter.column} onValueChange={(val) => updateConstantFilter(filter.id, 'column', val)}>
                        <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Column" />
                        </SelectTrigger>
                        <SelectContent>
                            {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder="Value"
                        value={filter.value}
                        onChange={(e) => updateConstantFilter(filter.id, 'value', e.target.value)}
                        className="flex-1"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeConstantFilter(filter.id)}>
                        <MinusCircle className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" size="lg" onClick={onGenerate} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Generate Summary
        </Button>
      </CardFooter>
    </Card>
  );
}
