/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { describe, expect, it } from "vitest"
import {
  aggregateZenDistribution,
  bucketPosition,
  formatEdge,
  whatIfCurve,
  ZEN_AGE_EDGES,
  ZEN_PRODUCT_EDGES,
  ZEN_SCORE_EDGES,
} from "@/lib/zen-score-charts"

describe("aggregateZenDistribution", () => {
  it("adds the instances and pads missing lists with zeros", () => {
    const first = { total: 1, downloading: 0, seeding: 0, paused: 0, error: 0, zenScoreCount: 2, zenScoreSum: 2.5, zenAgeBands: [1, 1, 0, 0, 0] }
    const second = { total: 1, downloading: 0, seeding: 0, paused: 0, error: 0, zenScoreCount: 1, zenScoreSum: 1, zenAgeBands: [0, 0, 0, 0, 1] }
    const total = aggregateZenDistribution([first, undefined, second])
    expect(total.count).toBe(3)
    expect(total.scoreSum).toBe(3.5)
    expect(total.ageBands).toEqual([1, 1, 0, 0, 1])
    expect(total.scoreHist).toHaveLength(ZEN_SCORE_EDGES.length + 1)
    expect(total.scoreHist.every((v) => v === 0)).toBe(true)
    expect(aggregateZenDistribution([]).ageBands).toHaveLength(ZEN_AGE_EDGES.length + 1)
  })
})

describe("bucketPosition", () => {
  it("puts values outside the edges in the middle of the open buckets", () => {
    expect(bucketPosition(0.1, ZEN_SCORE_EDGES)).toBe(0.5)
    expect(bucketPosition(5, ZEN_SCORE_EDGES)).toBe(ZEN_SCORE_EDGES.length + 0.5)
  })

  it("moves across a bucket between its edges", () => {
    // [1.0, 1.1) is bucket 6, so 1.0 is at its left side and 1.05 at its middle.
    expect(bucketPosition(1.0, ZEN_SCORE_EDGES)).toBeCloseTo(6, 10)
    expect(bucketPosition(1.05, ZEN_SCORE_EDGES)).toBeCloseTo(6.5, 10)
  })
})

describe("whatIfCurve", () => {
  const hist = [4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const sums = [0.2, 0.3, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0]

  it("starts at the full average and drops the lowest bucket at each step", () => {
    const curve = whatIfCurve(hist, sums, ZEN_PRODUCT_EDGES)
    expect(curve).toHaveLength(ZEN_PRODUCT_EDGES.length + 1)
    expect(curve[0]).toMatchObject({ threshold: 0, remaining: 10 })
    expect(curve[0].average).toBeCloseTo(1 / 10, 10)
    expect(curve[1]).toMatchObject({ threshold: ZEN_PRODUCT_EDGES[0], remaining: 6 })
    expect(curve[1].average).toBeCloseTo(0.8 / 6, 10)
    expect(curve[1].pointsShare).toBeCloseTo(0.8, 10)
    expect(curve[4].remaining).toBe(0)
    expect(curve[4].average).toBeNull()
  })
})

describe("formatEdge", () => {
  it("trims the decimals", () => {
    expect(formatEdge(0.5)).toBe("0.5")
    expect(formatEdge(0.075)).toBe("0.075")
    expect(formatEdge(2)).toBe("2")
  })
})
