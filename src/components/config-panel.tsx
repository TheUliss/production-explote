'use client';

import * as React from 'react';
import type { ConstantFilter } from './excel-insights-page';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Columns, Filter, MinusCircle, PlusCircle, ChevronDown, Eye, EyeOff, GripVertical, Plus, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DropAnimation,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

function SortableItem({ id }: { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between p-2 mb-2 rounded-md border bg-card text-card-foreground shadow-sm select-none",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-center gap-2 truncate">
        <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium truncate max-w-[180px]" title={id}>{id}</span>
      </div>
    </div>
  );
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
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Default closed on mobile, open on desktop
    setIsOpen(!isMobile);
  }, [isMobile]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const hiddenColumns = headers.filter(h => !selectedColumns.includes(h));

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selectedColumns.indexOf(active.id as string);
      const newIndex = selectedColumns.indexOf(over.id as string);
      setSelectedColumns(arrayMove(selectedColumns, oldIndex, newIndex));
    }
    setActiveId(null);
  };

  const removeColumn = (column: string) => {
    setSelectedColumns(selectedColumns.filter(c => c !== column));
  };

  const addColumn = (column: string) => {
    setSelectedColumns([...selectedColumns, column]);
  };

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
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
              <Label className="text-base font-medium flex items-center gap-2"><Columns className="h-4 w-4" /> Columns (Drag & Drop)</Label>
              <Separator className="my-2" />

              {/* Visible Columns (Sortable) */}
              <div className="mb-4">
                <Label className="text-xs text-muted-foreground mb-2 block">Visible ({selectedColumns.length})</Label>
                <ScrollArea className="h-48 rounded-md border bg-muted/20 p-2">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={selectedColumns}
                      strategy={verticalListSortingStrategy}
                    >
                      {selectedColumns.map((col) => (
                        <div key={col} className="relative group">
                          <SortableItem id={col} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeColumn(col)}
                            title="Hide column"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </SortableContext>
                    <DragOverlay dropAnimation={dropAnimation}>
                      {activeId ? <SortableItem id={activeId} /> : null}
                    </DragOverlay>
                  </DndContext>
                  {selectedColumns.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8 italic">No columns visible. Add some below.</p>
                  )}
                </ScrollArea>
              </div>

              {/* Hidden Columns */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Hidden ({hiddenColumns.length})</Label>
                <ScrollArea className="h-32 rounded-md border p-2">
                  {hiddenColumns.length > 0 ? (
                    hiddenColumns.map(col => (
                      <div key={col} className="flex items-center justify-between p-2 mb-1 rounded-md hover:bg-muted/50 transition-colors">
                        <span className="text-sm truncate max-w-[200px]" title={col}>{col}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-primary"
                          onClick={() => addColumn(col)}
                          title="Show column"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4 italic">All columns are visible.</p>
                  )}
                </ScrollArea>
              </div>

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
