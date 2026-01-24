'use client';

import type { ConstantFilter } from './excel-insights-page';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Columns, Filter, MinusCircle, PlusCircle, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface ConfigPanelProps {
  fileName: string;
  headers: string[];
  selectedColumns: string[];
  setSelectedColumns: (columns: string[]) => void;
  dateFilter: string;
  setDateFilter: (filter: string) => void;
  dateColumn: string;
  setDateColumn: (column: string) => void;
  constantFilters: ConstantFilter[];
  setConstantFilters: React.Dispatch<React.SetStateAction<ConstantFilter[]>>;
}

export function ConfigPanel({
  fileName,
  headers,
  selectedColumns,
  setSelectedColumns,
  dateFilter,
  setDateFilter,
  dateColumn,
  setDateColumn,
  constantFilters,
  setConstantFilters,
}: ConfigPanelProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = React.useState(true);

  React.useEffect(() => {
    // Default closed on mobile, open on desktop
    setIsOpen(!isMobile);
  }, [isMobile]);

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
    setConstantFilters([...constantFilters, { id: Date.now().toString(), column: '', value: '', enabled: true }]);
  };

  const updateConstantFilter = (id: string, key: 'column' | 'value', value: string) => {
    setConstantFilters(constantFilters.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const toggleConstantFilter = (id: string) => {
    setConstantFilters(constantFilters.map(f => f.id === id ? { ...f, enabled: f.enabled === false ? true : false } : f));
  };

  const removeConstantFilter = (id: string) => {
    setConstantFilters(constantFilters.filter(f => f.id !== id));
  };

  return (
    <Card className="sticky top-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between p-6 pb-2">
          <div className="space-y-1.5">
            <CardTitle className="text-xl">Configuration</CardTitle>
            <CardDescription className="truncate max-w-[200px]" title={fileName}>{fileName}</CardDescription>
          </div>

          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-9 p-0">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", !isOpen && "-rotate-90")} />
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            <div>
              <Label className="text-base font-medium flex items-center gap-2"><Columns className="h-4 w-4" /> Columns to Show</Label>
              <Separator className="my-2" />
              <div className="flex items-center space-x-2 mb-2">
                <Checkbox
                  id="select-all"
                  checked={headers.length > 0 && selectedColumns.length === headers.length}
                  onCheckedChange={handleSelectAllColumns}
                  disabled={headers.length === 0}
                />
                <Label htmlFor="select-all" className="font-medium">Select All</Label>
              </div>
              <ScrollArea className="h-40 rounded-md border p-2">
                {headers.length > 0 ? headers.map((header) => (
                  <div key={header} className="flex items-center space-x-2 p-1">
                    <Checkbox
                      id={header}
                      checked={selectedColumns.includes(header)}
                      onCheckedChange={() => handleColumnChange(header)}
                    />
                    <Label htmlFor={header} className="font-normal w-full truncate" title={header}>{header}</Label>
                  </div>
                )) : <p className="text-sm text-muted-foreground text-center p-4">Upload a file to see columns.</p>}
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</Label>
              <Separator className="my-2" />

              {/* Date Range Filter */}
              <div className='space-y-2 rounded-md border p-3'>
                <Label>Date Filter</Label>
                <p className="text-xs text-muted-foreground mb-2">Filtrar por: Schedule Date</p>
                <Select value={dateFilter} onValueChange={setDateFilter} disabled={!dateColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select date filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="due-soon-7">Due in next 7 days</SelectItem>
                    <SelectItem value="current-month">Current Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Constant Filters */}
              <div className='space-y-2 rounded-md border p-3'>
                <div className="flex items-center justify-between">
                  <Label>Constant Values</Label>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addConstantFilter} disabled={headers.length === 0}>
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                </div>
                {constantFilters.map((filter) => (
                  <div key={filter.id} className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8 shrink-0", filter.enabled === false ? "text-muted-foreground opacity-50" : "text-primary")}
                      onClick={() => toggleConstantFilter(filter.id)}
                      title={filter.enabled === false ? "Activar filtro" : "Desactivar filtro"}
                    >
                      {filter.enabled === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
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
                      className={cn("flex-1", filter.enabled === false && "opacity-50 line-through")}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeConstantFilter(filter.id)}>
                      <MinusCircle className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {constantFilters.length === 0 && <p className="text-sm text-muted-foreground text-center p-2">No constant filters added.</p>}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
