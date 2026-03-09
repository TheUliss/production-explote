'use client';

import * as React from 'react';
import type { ConstantFilter } from './excel-insights-page';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from '@/components/ui/separator';
import { Columns, Filter, MinusCircle, PlusCircle, ChevronDown, Eye, EyeOff, GripVertical, Plus, X, Save, FolderOpen, Trash2, Loader2, FileUp, FileDown, Search, Trash, CheckCircle, Clock as ClockIcon } from 'lucide-react';
import * as xlsx from 'xlsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { dbService, type ViewProfile } from '@/lib/db-service';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from './ui/date-range-picker';
import { SHIFTS } from '@/lib/types';
import { Checkbox } from './ui/checkbox';

interface ConfigPanelProps {
  fileName: string;
  headers: string[];
  selectedColumns: string[];
  setSelectedColumns: (columns: string[]) => void;
  dateFilter: string;
  setDateFilter: (filter: string) => void;
  dateColumn: string;
  setDateColumn: (column: string) => void;
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  constantFilters: ConstantFilter[];
  setConstantFilters: React.Dispatch<React.SetStateAction<ConstantFilter[]>>;
  onMainFileSelect: (file: File) => void;
  onPackingFileSelect: (file: File) => void;
  onClear: () => void;
  /** Number of packed serials currently loaded — used to know if packing file is active */
  packedCount: number;
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
      <div className="flex items-center gap-2 truncate text-[11px]">
        <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <span className="font-medium truncate max-w-[180px]" title={id}>{id}</span>
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
  dateRange,
  setDateRange,
  constantFilters,
  setConstantFilters,
  onMainFileSelect,
  onPackingFileSelect,
  onClear,
  packedCount,
}: ConfigPanelProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = React.useState(true);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);

  // Profile State
  const [profiles, setProfiles] = React.useState<ViewProfile[]>([]);
  const [newProfileName, setNewProfileName] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = React.useState(false);

  const { toast } = useToast();

  const loadProfiles = async () => {
    setIsLoadingProfiles(true);
    try {
      const data = await dbService.getProfiles();
      setProfiles(data);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  React.useEffect(() => {
    loadProfiles();
  }, []);

  const handleSaveProfile = async () => {
    if (!newProfileName.trim()) return;
    setIsSaving(true);
    try {
      await dbService.saveProfile(newProfileName, selectedColumns);
      setNewProfileName('');
      await loadProfiles();
      toast({ title: "Perfil guardado", description: `El perfil "${newProfileName}" se guardó correctamente.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el perfil. Verifica la configuración de Firebase." });
    } finally {
      setIsSaving(false);
    }
  };

  const applyProfile = (profile: ViewProfile) => {
    setSelectedColumns(profile.selectedColumns);
    toast({ title: "Perfil aplicado", description: `Se cargó la vista "${profile.name}".` });
  };

  const deleteProfile = async (id: string) => {
    try {
      await dbService.deleteProfile(id);
      await loadProfiles();
      toast({ title: "Perfil eliminado" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el perfil." });
    }
  };

  React.useEffect(() => {
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
            <CardTitle className="text-xl font-bold">Configuración</CardTitle>
            <CardDescription className="truncate max-w-[200px]" title={fileName}>
              {fileName}
            </CardDescription>
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
            {/* View Profiles Section */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                <Save className="h-3 w-3" /> Perfiles de Vista
              </Label>
              <Separator className="my-1" />

              <div className="flex gap-2">
                <Input
                  placeholder="Nuevo..."
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="h-8 text-[11px]"
                />
                <Button size="sm" className="h-8 px-2 text-[11px]" onClick={handleSaveProfile} disabled={isSaving || !newProfileName}>
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
              </div>

              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {isLoadingProfiles ? (
                  <div className="flex justify-center p-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground opacity-20" /></div>
                ) : profiles.length > 0 ? (
                  profiles.map((p) => (
                    <div key={p.id} className="flex items-center justify-between group p-1.5 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-all">
                      <button
                        className="text-[11px] font-medium flex items-center gap-2 truncate text-left flex-1"
                        onClick={() => applyProfile(p)}
                      >
                        <FolderOpen className="h-3 w-3 text-blue-500" />
                        {p.name}
                      </button>
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => deleteProfile(p.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-muted-foreground text-center py-2 italic font-light">No hay perfiles.</p>
                )}
              </div>
            </div>

            {/* Quick Actions (Utility) — only Limpiar remains here */}
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[11px] px-2 text-destructive hover:bg-destructive/10"
                onClick={() => setShowClearConfirm(true)}
                disabled={fileName === 'Unknown file'}
              >
                <Trash className="mr-1.5 h-3.5 w-3.5" />
                Limpiar todo
              </Button>
            </div>

            {/* Columns Layout Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold flex items-center gap-2"><Columns className="h-3 w-3" /> Columnas</Label>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" disabled={hiddenColumns.length === 0}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
                    <DropdownMenuLabel className="text-xs">Agregar Columna</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {hiddenColumns.map(col => (
                      <DropdownMenuItem key={col} onClick={() => addColumn(col)} className="text-[11px] cursor-pointer">
                        <Plus className="mr-2 h-3 w-3 text-primary" />
                        {col}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Separator className="my-2" />

              <div className="mb-4">
                <ScrollArea className="h-64 rounded-md border bg-muted/10 p-2">
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
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </SortableContext>
                    <DragOverlay dropAnimation={dropAnimation}>
                      {activeId ? <SortableItem id={activeId} /> : null}
                    </DragOverlay>
                  </DndContext>
                  {selectedColumns.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-8 italic font-light">No hay columnas visibles.</p>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Filters Section */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold flex items-center gap-2"><Filter className="h-3 w-3" /> Filtros</Label>
              <Separator className="my-1" />

              <div className='space-y-3 rounded-md border p-3 bg-muted/10'>
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold">Columna de Fecha</Label>
                  <Select value={dateColumn} onValueChange={setDateColumn}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Seleccionar columna..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {headers.map(h => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold">Rango de Producción</Label>
                  <Select value={dateFilter} onValueChange={setDateFilter} disabled={!dateColumn}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Periodo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Ver Todas</SelectItem>
                      <SelectItem value="overdue">Vencidas</SelectItem>
                      <SelectItem value="due-soon-7">Próximos 7 días</SelectItem>
                      <SelectItem value="current-month">Mes en curso</SelectItem>
                      <SelectItem value="custom">Rango Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {dateFilter === 'custom' && (
                    <div className="pt-1">
                      <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                    </div>
                  )}
                </div>

              </div>

              <div className='space-y-2 rounded-md border p-3 bg-muted/10'>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Filtros de Texto</Label>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addConstantFilter} disabled={headers.length === 0}>
                    <PlusCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {constantFilters.map((filter) => (
                    <div key={filter.id} className="flex items-center gap-1.5 bg-background p-1.5 rounded border border-transparent hover:border-border transition-colors">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7 shrink-0", filter.enabled === false ? "text-muted-foreground opacity-30" : "text-primary")}
                        onClick={() => toggleConstantFilter(filter.id)}
                      >
                        {filter.enabled === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Select value={filter.column} onValueChange={(val) => updateConstantFilter(filter.id, 'column', val)}>
                        <SelectTrigger className="flex-1 h-7 text-[10px]">
                          <SelectValue placeholder="Col" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map(h => <SelectItem key={h} value={h} className="text-[10px]">{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Valor..."
                        value={filter.value}
                        onChange={(e) => updateConstantFilter(filter.id, 'value', e.target.value)}
                        className={cn("flex-1 h-7 text-[10px]", filter.enabled === false && "opacity-30 line-through")}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeConstantFilter(filter.id)}>
                        <MinusCircle className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {constantFilters.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-2 italic font-light">Sin filtros activos.</p>}
                </div>
              </div>
            </div>

            {/* ── Empaque & Turnos ─────────────────────────── */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <FileUp className="h-3 w-3" /> Empaque
              </Label>

              {/* Packing file upload row */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-[11px] justify-center bg-muted/20 border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
                  asChild
                  title="Subir reporte de empaque"
                >
                  <label className="cursor-pointer flex items-center justify-center gap-1.5">
                    {packedCount > 0
                      ? <><CheckCircle className="h-3.5 w-3.5 text-green-600" /><span className="text-green-700 dark:text-green-400 font-medium">{packedCount} seriales cargados</span></>
                      : <><FileUp className="h-3.5 w-3.5 text-blue-500" /><span>Subir hoja de empaque</span></>}
                    <input
                      type="file"
                      className="hidden"
                      accept=".xlsx, .xls"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPackingFileSelect(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  title="Descargar plantilla de empaque"
                  onClick={(e) => {
                    e.preventDefault();
                    const ws = xlsx.utils.aoa_to_sheet([["Linea", "Seriales", "Packed Date"]]);
                    const wb = xlsx.utils.book_new();
                    xlsx.utils.book_append_sheet(wb, ws, "Template");
                    xlsx.writeFile(wb, "packing_template.xlsx");
                  }}
                >
                  <FileDown className="h-3.5 w-3.5" />
                </Button>
              </div>

            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Clear Confirmation Dialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todos los datos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el archivo cargado, los filtros, las columnas seleccionadas y los seriales de empaque. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { onClear(); setShowClearConfirm(false); }}
            >
              Sí, limpiar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
