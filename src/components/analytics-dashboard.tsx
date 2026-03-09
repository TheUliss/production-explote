"use client"

import * as React from "react"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
    AreaChart,
    Area
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { format, addDays, startOfToday } from "date-fns"
import type { ProductionRow } from "@/lib/types"
import { getShiftForDate, SHIFTS } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface AnalyticsDashboardProps {
    data: ProductionRow[]
    packedSerials: Map<string, Date>
}


const SHIFT_COLORS: Record<string, string> = {
    N1: '#3b82f6',
    N3: '#8b5cf6',
    N2: '#f59e0b',
    N4: '#ef4444',
}

const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#f472b6"]

export function AnalyticsDashboard({ data, packedSerials }: AnalyticsDashboardProps) {
    // Shift selectors for the packed pie chart
    const [activeShifts, setActiveShifts] = React.useState<Set<string>>(
        new Set(SHIFTS.map(s => s.id))
    )

    const toggleShift = (id: string) => {
        setActiveShifts(prev => {
            const next = new Set(prev)
            if (next.has(id)) { next.delete(id) } else { next.add(id) }
            return next
        })
    }

    // Calculate packed count per shift
    const packByShift = React.useMemo(() => {
        if (!packedSerials.size) return []
        const counts: Record<string, number> = {}
        packedSerials.forEach((date) => {
            const shift = getShiftForDate(date)
            if (shift && shift !== 'all') {
                counts[shift] = (counts[shift] || 0) + 1
            }
        })
        return SHIFTS
            .filter(s => activeShifts.has(s.id))
            .map(s => ({ name: s.id, label: s.label, value: counts[s.id] || 0, color: SHIFT_COLORS[s.id] }))
            .filter(d => d.value > 0)
    }, [packedSerials, activeShifts])

    const totalPackedFiltered = packByShift.reduce((a, b) => a + b.value, 0)

    const chartData = React.useMemo(() => {
        if (!data || data.length === 0) return { groupData: [], statusData: [], dailyVolume: [] }

        // 1. Group Data (Pie Chart)
        const groups: Record<string, number> = {}
        data.forEach(row => {
            const g = row['Schedule Group'] || 'N/A'
            groups[g] = (groups[g] || 0) + 1
        })
        const groupData = Object.entries(groups).map(([name, value]) => ({ name, value }))

        // 2. Status Data (Bar Chart: Overdue, Next 3d, Next 7d, On Time)
        const today = startOfToday()
        const d3 = addDays(today, 3)
        const d7 = addDays(today, 7)

        let overdue = 0, due3 = 0, due7 = 0, onTime = 0
        data.forEach(row => {
            const date = row['Schedule Date']
            if (!(date instanceof Date)) return
            if (date < today) overdue++
            else if (date <= d3) due3++
            else if (date <= d7) due7++
            else onTime++
        })
        const statusData = [
            { name: "Vencidos", value: overdue, color: "#ef4444" },
            { name: "3 Días", value: due3, color: "#f97316" },
            { name: "7 Días", value: due7, color: "#eab308" },
            { name: "A tiempo", value: onTime, color: "#22c55e" }
        ]

        // 3. Daily Volume (Area Chart: Last 7 days + next 10 days)
        const daily: Record<string, { qty: number, packed: number }> = {}
        for (let i = -7; i < 10; i++) {
            const d = addDays(today, i)
            daily[format(d, "MMM dd")] = { qty: 0, packed: 0 }
        }

        // Calculate Job Volume
        data.forEach(row => {
            const date = row['Schedule Date']
            if (!(date instanceof Date)) return
            const key = format(date, "MMM dd")
            if (daily[key] !== undefined) {
                daily[key].qty += parseInt(String(row['Qty Ordered'] ?? '0'), 10) || 0
            }
        })

        // Calculate Packed Volume (from packing template dates)
        packedSerials.forEach((packedDate) => {
            const key = format(packedDate, "MMM dd")
            if (daily[key] !== undefined) {
                daily[key].packed += 1
            }
        })

        const dailyVolume = Object.entries(daily).map(([name, vals]) => ({
            name,
            qty: vals.qty,
            packed: vals.packed
        }))

        return { groupData, statusData, dailyVolume }
    }, [data, packedSerials])

    return (
        <div className="space-y-4 mb-8">

            {/* ── Empacado por Turno (only when packing file loaded) ── */}
            {packedSerials.size > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <CardTitle className="text-sm font-medium">Empacado por Turno</CardTitle>
                                <CardDescription>
                                    {totalPackedFiltered.toLocaleString()} seriales en la selección
                                </CardDescription>
                            </div>
                            {/* Shift toggle buttons */}
                            <div className="flex flex-wrap gap-1.5">
                                {SHIFTS.map(s => (
                                    <Button
                                        key={s.id}
                                        size="sm"
                                        variant={activeShifts.has(s.id) ? 'default' : 'outline'}
                                        className={cn(
                                            'h-7 px-2.5 text-xs font-bold transition-all',
                                            activeShifts.has(s.id) && 'text-white'
                                        )}
                                        style={activeShifts.has(s.id) ? { background: SHIFT_COLORS[s.id], borderColor: SHIFT_COLORS[s.id] } : {}}
                                        onClick={() => toggleShift(s.id)}
                                        title={s.label}
                                    >
                                        {s.id}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="h-[220px]">
                        {packByShift.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                                Sin datos para los turnos seleccionados
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={packByShift}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={85}
                                        paddingAngle={4}
                                        dataKey="value"
                                        label={({ name, value, percent }) =>
                                            `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                                        }
                                        labelLine={false}
                                    >
                                        {packByShift.map((entry) => (
                                            <Cell key={entry.name} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number, name: string) => [
                                            `${value} seriales`,
                                            SHIFTS.find(s => s.id === name)?.label ?? name
                                        ]}
                                    />
                                    <Legend
                                        formatter={(value) => SHIFTS.find(s => s.id === value)?.label ?? value}
                                        verticalAlign="bottom"
                                        height={36}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* remaining charts grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Volume Trend */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Volumen de Producción (Piezas x Día)</CardTitle>
                        <CardDescription>Comparativa entre Carga Programada vs Empacado Real (últimos 7 días y próximos 10)</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData.dailyVolume}>
                                <defs>
                                    <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorPacked" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                                <Tooltip />
                                <Legend verticalAlign="top" height={36} />
                                <Area type="monotone" name="Programado" dataKey="qty" stroke="#3b82f6" fillOpacity={1} fill="url(#colorQty)" />
                                <Area type="monotone" name="Empacado" dataKey="packed" stroke="#22c55e" fillOpacity={1} fill="url(#colorPacked)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Group Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Distribución por Línea (Jobs)</CardTitle>
                        <CardDescription>Participación por Schedule Group</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData.groupData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {chartData.groupData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Urgency Status */}
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Estado de Urgencia (Filtrado)</CardTitle>
                        <CardDescription>Jobs clasificados por fecha de entrega</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData.statusData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" fontSize={12} hide />
                                <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {chartData.statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
