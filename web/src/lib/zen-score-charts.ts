/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import type { TorrentStats } from "@/types"

// Bucket edges of the Zen distributions. Keep them in step with zen_stats.go.
// n edges make n + 1 buckets: below the first edge, between each pair, and
// from the last edge up.
export const ZEN_SCORE_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]
export const ZEN_COEF_EDGES = [0.06, 0.07, 0.08, 0.09, 0.1, 0.12, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0, 1.25, 1.5]
export const ZEN_PRODUCT_EDGES = [0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5]
/** Seeding days. */
export const ZEN_AGE_EDGES = [7, 30, 90, 180]
export const ZEN_SWARM_EDGES = [41, 201, 251]
/** Megabytes, decimal. */
export const ZEN_SIZE_EDGES_MB = [10, 100, 1000, 4000, 25000]

export interface ZenDistribution {
  count: number
  scoreSum: number
  coefSum: number
  productSum: number
  baseSum: number
  durationSum: number
  swarmSum: number
  scoreHist: number[]
  coefHist: number[]
  productHist: number[]
  productHistSum: number[]
  ageBands: number[]
  swarmBands: number[]
  sizeBands: number[]
  sizeBandPoints: number[]
}

function sumArrays(lists: Array<number[] | undefined>, length: number): number[] {
  const total = new Array<number>(length).fill(0)
  for (const list of lists) {
    list?.forEach((value, index) => {
      if (index < length) total[index] += value
    })
  }
  return total
}

/** Adds the Zen statistics of every instance. */
export function aggregateZenDistribution(statsList: Array<TorrentStats | null | undefined>): ZenDistribution {
  const stats = statsList.filter((s): s is TorrentStats => Boolean(s))
  const sum = (pick: (s: TorrentStats) => number | undefined) => stats.reduce((total, s) => total + (pick(s) ?? 0), 0)
  const lists = (pick: (s: TorrentStats) => number[] | undefined, edges: number[]) =>
    sumArrays(stats.map(pick), edges.length + 1)

  return {
    count: sum((s) => s.zenScoreCount),
    scoreSum: sum((s) => s.zenScoreSum),
    coefSum: sum((s) => s.zenCoefSum),
    productSum: sum((s) => s.zenScoreCoefSum),
    baseSum: sum((s) => s.zenBaseSum),
    durationSum: sum((s) => s.zenDurationSum),
    swarmSum: sum((s) => s.zenSwarmSum),
    scoreHist: lists((s) => s.zenScoreHist, ZEN_SCORE_EDGES),
    coefHist: lists((s) => s.zenCoefHist, ZEN_COEF_EDGES),
    productHist: lists((s) => s.zenProductHist, ZEN_PRODUCT_EDGES),
    productHistSum: lists((s) => s.zenProductHistSum, ZEN_PRODUCT_EDGES),
    ageBands: lists((s) => s.zenAgeBands, ZEN_AGE_EDGES),
    swarmBands: lists((s) => s.zenSwarmBands, ZEN_SWARM_EDGES),
    sizeBands: lists((s) => s.zenSizeBands, ZEN_SIZE_EDGES_MB),
    sizeBandPoints: lists((s) => s.zenSizeBandPoints, ZEN_SIZE_EDGES_MB),
  }
}

/** Trims a number to at most three decimals: 0.5 stays 0.5, 0.075 stays 0.075. */
export function formatEdge(value: number): string {
  return String(Number(value.toFixed(3)))
}

/**
 * Where a value falls on a bar axis of edges.length + 1 buckets, in bucket
 * units from 0 to the bucket count. The first and last buckets have one open
 * side, so a value outside the edges sits at the middle of that bucket.
 */
export function bucketPosition(value: number, edges: number[]): number {
  if (value < edges[0]) return 0.5
  for (let i = 0; i < edges.length - 1; i++) {
    if (value < edges[i + 1]) return i + 1 + (value - edges[i]) / (edges[i + 1] - edges[i])
  }
  return edges.length + 0.5
}

export interface WhatIfPoint {
  /** Items with a product below this are removed. */
  threshold: number
  remaining: number
  /** Average product of what remains, or null when nothing remains. */
  average: number | null
  /** Share of all the points that remain, from 0 to 1. */
  pointsShare: number
}

/**
 * The average product left after removing everything below each product edge,
 * from nothing removed up to everything but the top bucket. It is exact at the
 * edges, because the histogram keeps the sum of each bucket.
 */
export function whatIfCurve(productHist: number[], productHistSum: number[], edges: number[]): WhatIfPoint[] {
  const totalCount = productHist.reduce((a, b) => a + b, 0)
  const totalSum = productHistSum.reduce((a, b) => a + b, 0)
  const points: WhatIfPoint[] = []
  let remaining = totalCount
  let remainingSum = totalSum
  for (let i = 0; i <= edges.length; i++) {
    points.push({
      threshold: i === 0 ? 0 : edges[i - 1],
      remaining,
      average: remaining > 0 ? remainingSum / remaining : null,
      pointsShare: totalSum > 0 ? remainingSum / totalSum : 0,
    })
    remaining -= productHist[i] ?? 0
    remainingSum -= productHistSum[i] ?? 0
  }
  return points
}
