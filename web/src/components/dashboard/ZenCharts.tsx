/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  aggregateZenDistribution,
  bucketPosition,
  formatEdge,
  whatIfCurve,
  ZEN_AGE_EDGES,
  ZEN_COEF_EDGES,
  ZEN_PRODUCT_EDGES,
  ZEN_SCORE_EDGES,
  ZEN_SIZE_EDGES_MB,
  ZEN_SWARM_EDGES,
} from "@/lib/zen-score-charts"
import type { TorrentStats } from "@/types"
import type { TFunction } from "i18next"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

const WIDTH = 1000
const PAD = { left: 56, right: 24, top: 24, bottom: 36 }
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })

/** The next 1, 2, 5 or 10 times a power of ten at or above value, for a round axis top. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return step * power
}

function bucketLabels(edges: number[], format: (value: number) => string, t: TFunction): string[] {
  const last = edges.length
  return Array.from({ length: last + 1 }, (_, i) => {
    if (i === 0) return t("zenCharts.below", { value: format(edges[0]) })
    if (i === last) return t("zenCharts.atLeast", { value: format(edges[last - 1]) })
    return t("zenCharts.between", { from: format(edges[i - 1]), to: format(edges[i]) })
  })
}

function ChartCard({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">{children}</div>
        </div>
      </CardContent>
    </Card>
  )
}

interface AxisProps {
  height: number
  max: number
  format?: (value: number) => string
}

/** Horizontal grid lines with their values on the left. */
function Axis({ height, max, format = (v) => compact.format(v) }: AxisProps) {
  const innerHeight = height - PAD.top - PAD.bottom
  return (
    <g className="text-muted-foreground" fontSize="12">
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = PAD.top + innerHeight * (1 - fraction)
        return (
          <g key={fraction}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="currentColor" strokeOpacity={fraction === 0 ? 0.5 : 0.15} />
            <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="currentColor">{format(max * fraction)}</text>
          </g>
        )
      })}
    </g>
  )
}

interface BarChartProps {
  values: number[]
  labels: string[]
  color: string
  height?: number
  /** Position of the average line, in bucket units, with its label. */
  marker?: { position: number; label: string }
  tooltip: (index: number) => string
  ariaLabel: string
}

function BarChart({ values, labels, color, height = 260, marker, tooltip, ariaLabel }: BarChartProps) {
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = height - PAD.top - PAD.bottom - (values.length > 12 ? 22 : 0)
  const max = niceMax(Math.max(...values, 0))
  const slot = innerWidth / values.length
  const barWidth = slot * 0.72
  const baseline = PAD.top + innerHeight
  const rotate = values.length > 12

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
      <Axis height={height - (rotate ? 22 : 0)} max={max} />
      {values.map((value, i) => {
        const barHeight = (value / max) * innerHeight
        const x = PAD.left + i * slot + (slot - barWidth) / 2
        return (
          <g key={labels[i]}>
            <rect x={x} y={baseline - barHeight} width={barWidth} height={barHeight} rx={3} fill={color}>
              <title>{tooltip(i)}</title>
            </rect>
            {value > 0 && (
              <text x={x + barWidth / 2} y={baseline - barHeight - 5} textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground">
                {compact.format(value)}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={baseline + 16}
              textAnchor={rotate ? "end" : "middle"}
              fontSize="11"
              fill="currentColor"
              className="text-muted-foreground"
              transform={rotate ? `rotate(-35 ${x + barWidth / 2} ${baseline + 16})` : undefined}
            >
              {labels[i]}
            </text>
          </g>
        )
      })}
      {marker && (
        <g>
          <line
            x1={PAD.left + marker.position * slot}
            x2={PAD.left + marker.position * slot}
            y1={PAD.top - 6}
            y2={baseline}
            stroke="var(--chart-5)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          <text x={PAD.left + marker.position * slot + 6} y={PAD.top + 6} fontSize="12" fontWeight={600} fill="var(--chart-5)">
            {marker.label}
          </text>
        </g>
      )}
    </svg>
  )
}

interface PairedBarsProps {
  labels: string[]
  first: number[]
  second: number[]
  firstLabel: string
  secondLabel: string
  tooltip: (index: number, series: "first" | "second") => string
  ariaLabel: string
}

/** Two bars per band, as shares from 0 to 1. */
function PairedBars({ labels, first, second, firstLabel, secondLabel, tooltip, ariaLabel }: PairedBarsProps) {
  const height = 280
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = height - PAD.top - PAD.bottom - 20
  const slot = innerWidth / labels.length
  const barWidth = slot * 0.3
  const baseline = PAD.top + innerHeight
  const percent = (v: number) => `${Math.round(v * 100)}%`

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
        <Axis height={height - 20} max={1} format={percent} />
        {labels.map((label, i) => {
          const center = PAD.left + i * slot + slot / 2
          return (
            <g key={label}>
              {([["first", first[i], "var(--chart-2)", -barWidth - 2], ["second", second[i], "var(--chart-1)", 2]] as const).map(([series, share, color, dx]) => (
                <g key={series}>
                  <rect x={center + dx} y={baseline - share * innerHeight} width={barWidth} height={share * innerHeight} rx={3} fill={color}>
                    <title>{tooltip(i, series)}</title>
                  </rect>
                  {share > 0.005 && (
                    <text x={center + dx + barWidth / 2} y={baseline - share * innerHeight - 5} textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground">
                      {percent(share)}
                    </text>
                  )}
                </g>
              ))}
              <text x={center} y={baseline + 18} textAnchor="middle" fontSize="12" fill="currentColor" className="text-muted-foreground">{label}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-2)" }} />{firstLabel}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-1)" }} />{secondLabel}</span>
      </div>
    </div>
  )
}

interface WhatIfChartProps {
  points: ReturnType<typeof whatIfCurve>
  total: number
  currentAverage: number
  labels: { current: string; remaining: string; average: string }
  tooltip: (index: number) => string
  ariaLabel: string
}

/** Bars show how many items remain at each cut-off, the line the average product they leave. */
function WhatIfChart({ points, total, currentAverage, labels, tooltip, ariaLabel }: WhatIfChartProps) {
  const height = 300
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = height - PAD.top - PAD.bottom
  const baseline = PAD.top + innerHeight
  const slot = innerWidth / points.length
  const maxAverage = niceMax(Math.max(...points.map((p) => p.average ?? 0), currentAverage))
  const x = (i: number) => PAD.left + i * slot + slot / 2
  const yAverage = (value: number) => baseline - (value / maxAverage) * innerHeight

  const linePoints = points.flatMap((p, i) => (p.average === null ? [] : [`${x(i)},${yAverage(p.average)}`]))

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
        <Axis height={height} max={maxAverage} format={(v) => v.toFixed(2)} />
        {points.map((p, i) => {
          const barHeight = total > 0 ? (p.remaining / total) * innerHeight : 0
          return (
            <g key={p.threshold}>
              <rect x={x(i) - slot * 0.36} y={baseline - barHeight} width={slot * 0.72} height={barHeight} rx={3} fill="var(--chart-3)" fillOpacity={0.28}>
                <title>{tooltip(i)}</title>
              </rect>
              <text x={x(i)} y={baseline + 18} textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground">
                {formatEdge(p.threshold)}
              </text>
            </g>
          )
        })}
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={yAverage(currentAverage)} y2={yAverage(currentAverage)} stroke="var(--chart-5)" strokeDasharray="6 4" strokeWidth={1.5} />
        <text x={WIDTH - PAD.right} y={yAverage(currentAverage) - 6} textAnchor="end" fontSize="12" fontWeight={600} fill="var(--chart-5)">
          {labels.current}
        </text>
        <polyline points={linePoints.join(" ")} fill="none" stroke="var(--chart-1)" strokeWidth={3} strokeLinejoin="round" />
        {points.map((p, i) =>
          p.average === null ? null : (
            <circle key={p.threshold} cx={x(i)} cy={yAverage(p.average)} r={5} fill="var(--chart-1)">
              <title>{tooltip(i)}</title>
            </circle>
          )
        )}
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: "var(--chart-1)" }} />{labels.average}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm opacity-40" style={{ background: "var(--chart-3)" }} />{labels.remaining}</span>
      </div>
    </div>
  )
}

/** Where the average score comes from, as one stacked bar. */
function PartsBar({ parts, total }: { parts: Array<{ label: string; value: number; color: string }>; total: number }) {
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-md">
        {parts.map((part) => (
          <div
            key={part.label}
            className="flex items-center justify-center text-xs font-semibold text-white"
            style={{ width: `${total > 0 ? (part.value / total) * 100 : 0}%`, background: part.color }}
            title={`${part.label}: ${part.value.toFixed(2)}`}
          >
            {part.value >= total * 0.06 ? part.value.toFixed(2) : ""}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {parts.map((part) => (
          <span key={part.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: part.color }} />
            {part.label}: <span className="font-medium text-foreground">{part.value.toFixed(2)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Charts of how the Zen Score, the Zen coefficient and their product are spread over the c411 torrents. */
export function ZenCharts({ stats }: { stats: Array<TorrentStats | undefined> }) {
  const { t } = useTranslation("dashboard")
  const data = useMemo(() => aggregateZenDistribution(stats), [stats])

  if (data.count === 0) return null

  const averageScore = data.scoreSum / data.count
  const averageCoef = data.coefSum / data.count
  const averageProduct = data.productSum / data.count
  const share = (list: number[]) => {
    const total = list.reduce((a, b) => a + b, 0)
    return list.map((v) => (total > 0 ? v / total : 0))
  }
  const format2 = (v: number) => v.toFixed(2)
  const average = (value: number) => t("zenCharts.average", { value: format2(value) })
  const items = (count: number) => t("zenCharts.items", { count })
  const percent = (v: number) => `${(v * 100).toFixed(1)}%`

  const scoreLabels = bucketLabels(ZEN_SCORE_EDGES, formatEdge, t)
  const coefLabels = bucketLabels(ZEN_COEF_EDGES, formatEdge, t)
  const productLabels = bucketLabels(ZEN_PRODUCT_EDGES, formatEdge, t)
  const ageLabels = bucketLabels(ZEN_AGE_EDGES, (v) => t("zenCharts.unitDays", { value: v }), t)
  const swarmLabels = bucketLabels(ZEN_SWARM_EDGES, (v) => String(v), t)
  const sizeLabels = bucketLabels(ZEN_SIZE_EDGES_MB, (v) => (v >= 1000 ? t("zenCharts.unitGB", { value: v / 1000 }) : t("zenCharts.unitMB", { value: v })), t)

  const histogramTooltip = (labels: string[], values: number[]) => (i: number) =>
    `${labels[i]}: ${items(values[i])} (${percent(values[i] / data.count)})`

  const whatIf = whatIfCurve(data.productHist, data.productHistSum, ZEN_PRODUCT_EDGES)
  const itemShare = share(data.sizeBands)
  const pointShare = share(data.sizeBandPoints)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("zenCharts.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("zenCharts.subtitle", { count: data.count })}</p>
      </div>

      <ChartCard title={t("zenCharts.scoreTitle")} description={t("zenCharts.scoreDescription")}>
        <BarChart
          values={data.scoreHist}
          labels={scoreLabels}
          color="var(--chart-2)"
          marker={{ position: bucketPosition(averageScore, ZEN_SCORE_EDGES), label: average(averageScore) }}
          tooltip={histogramTooltip(scoreLabels, data.scoreHist)}
          ariaLabel={t("zenCharts.scoreTitle")}
        />
      </ChartCard>

      <ChartCard title={t("zenCharts.coefTitle")} description={t("zenCharts.coefDescription")}>
        <BarChart
          values={data.coefHist}
          labels={coefLabels}
          color="var(--chart-3)"
          marker={{ position: bucketPosition(averageCoef, ZEN_COEF_EDGES), label: average(averageCoef) }}
          tooltip={histogramTooltip(coefLabels, data.coefHist)}
          ariaLabel={t("zenCharts.coefTitle")}
        />
      </ChartCard>

      <ChartCard title={t("zenCharts.productTitle")} description={t("zenCharts.productDescription")}>
        <BarChart
          values={data.productHist}
          labels={productLabels}
          color="var(--chart-1)"
          marker={{ position: bucketPosition(averageProduct, ZEN_PRODUCT_EDGES), label: average(averageProduct) }}
          tooltip={histogramTooltip(productLabels, data.productHist)}
          ariaLabel={t("zenCharts.productTitle")}
        />
      </ChartCard>

      <ChartCard title={t("zenCharts.whatIfTitle")} description={t("zenCharts.whatIfDescription")}>
        <WhatIfChart
          points={whatIf}
          total={data.count}
          currentAverage={averageProduct}
          labels={{
            current: t("zenCharts.whatIfCurrent", { value: format2(averageProduct) }),
            remaining: t("zenCharts.whatIfRemaining"),
            average: t("zenCharts.whatIfAverage"),
          }}
          tooltip={(i) =>
            t("zenCharts.whatIfTooltip", {
              threshold: formatEdge(whatIf[i].threshold),
              remaining: whatIf[i].remaining,
              average: whatIf[i].average === null ? "-" : format2(whatIf[i].average),
              points: percent(whatIf[i].pointsShare),
            })
          }
          ariaLabel={t("zenCharts.whatIfTitle")}
        />
      </ChartCard>

      <ChartCard title={t("zenCharts.partsTitle")} description={t("zenCharts.partsDescription")}>
        <PartsBar
          total={averageScore}
          parts={[
            { label: t("zenCharts.partBase"), value: data.baseSum / data.count, color: "var(--chart-2)" },
            { label: t("zenCharts.partDuration"), value: data.durationSum / data.count, color: "var(--chart-3)" },
            { label: t("zenCharts.partSwarm"), value: data.swarmSum / data.count, color: "var(--chart-4)" },
          ]}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          {t("zenCharts.partsSummary", { score: format2(averageScore), coef: format2(averageCoef), product: format2(averageProduct) })}
        </p>
      </ChartCard>

      <ChartCard title={t("zenCharts.sizeTitle")} description={t("zenCharts.sizeDescription")}>
        <PairedBars
          labels={sizeLabels}
          first={itemShare}
          second={pointShare}
          firstLabel={t("zenCharts.shareOfItems")}
          secondLabel={t("zenCharts.shareOfPoints")}
          tooltip={(i, series) =>
            series === "first"
              ? `${sizeLabels[i]}: ${t("zenCharts.shareOfItems")} ${percent(itemShare[i])} (${items(data.sizeBands[i])})`
              : `${sizeLabels[i]}: ${t("zenCharts.shareOfPoints")} ${percent(pointShare[i])}`
          }
          ariaLabel={t("zenCharts.sizeTitle")}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("zenCharts.ageTitle")} description={t("zenCharts.ageDescription")}>
          <BarChart
            height={240}
            values={data.ageBands}
            labels={ageLabels}
            color="var(--chart-4)"
            tooltip={histogramTooltip(ageLabels, data.ageBands)}
            ariaLabel={t("zenCharts.ageTitle")}
          />
        </ChartCard>
        <ChartCard title={t("zenCharts.swarmTitle")} description={t("zenCharts.swarmDescription")}>
          <BarChart
            height={240}
            values={data.swarmBands}
            labels={swarmLabels}
            color="var(--chart-5)"
            tooltip={histogramTooltip(swarmLabels, data.swarmBands)}
            ariaLabel={t("zenCharts.swarmTitle")}
          />
        </ChartCard>
      </div>
    </div>
  )
}
