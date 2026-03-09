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
import { format, addDays, startOfToday, isWithinInterval } from "date-fns"
import type { ProductionRow } from "@/lib/types"

interface AnalyticsDashboardProps {
    data: ProductionRow[]
    packedSerials: Map<string, Date>
}

const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#f472b6"]

export function AnalyticsDashboard({ data, packedSerials }: AnalyticsDashboardProps) {
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
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
    )
}
