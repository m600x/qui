/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { describe, expect, it } from "vitest"
import { computeZenPayout, dayShare, parseZenPayoutSettings } from "@/lib/zen-payout"

describe("computeZenPayout", () => {
  // 100 torrents, average coefficient 0.08, average score 1.2.
  const found = { count: 100, scoreSum: 120, coefSum: 8 }

  it("applies T × P × S × I ÷ 7 × (1 + B)", () => {
    const payout = computeZenPayout(found, { bonusPercent: 36 }, 0.758)
    const wholeDay = (100 * 0.08 * 1.2) / 7 * 1.36
    expect(payout?.projected).toBe(Math.round(wholeDay))
    expect(payout?.soFar).toBe(Math.round(wholeDay * 0.758))
  })

  it("matches the worked example with the live averages", () => {
    // T = 33,597, S = 0.08297, I = 1.22819, B = 36%, P = 0.758 gives about 504; a whole day about 665.
    const averages = { count: 100000, coefSum: 8297, scoreSum: 122819 }
    const payout = computeZenPayout(averages, { bonusPercent: 36, countedTorrents: 33597 }, 0.758)
    expect(payout?.counted).toBe(33597)
    expect(payout?.soFar).toBeGreaterThanOrEqual(503)
    expect(payout?.soFar).toBeLessThanOrEqual(505)
    expect(payout?.projected).toBeGreaterThanOrEqual(664)
    expect(payout?.projected).toBeLessThanOrEqual(666)
  })

  it("returns null when no torrent counts", () => {
    expect(computeZenPayout({ count: 0, scoreSum: 0, coefSum: 0 }, { bonusPercent: 36 }, 0.5)).toBeNull()
  })
})

describe("dayShare", () => {
  it("is the part of the day that has passed", () => {
    expect(dayShare(new Date(2026, 10, 6, 0, 0, 0))).toBe(0)
    expect(dayShare(new Date(2026, 10, 6, 12, 0, 0))).toBe(0.5)
    expect(dayShare(new Date(2026, 10, 6, 18, 11, 0))).toBeCloseTo(0.758, 3)
  })
})

describe("parseZenPayoutSettings", () => {
  it("keeps valid numbers and drops the rest", () => {
    expect(parseZenPayoutSettings('{"bonusPercent":20,"countedTorrents":500}')).toEqual({ bonusPercent: 20, countedTorrents: 500 })
    expect(parseZenPayoutSettings('{"bonusPercent":"x","countedTorrents":-3}')).toEqual({ bonusPercent: 36, countedTorrents: undefined })
    expect(() => parseZenPayoutSettings("nope")).toThrow()
  })
})
