/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { describe, expect, it } from "vitest"
import { computeZenCoef, computeZenScore, parseZenCategoryValues } from "@/lib/zen-score"

const GB = 1024 ** 3
const DAY = 24 * 60 * 60

const values = { xxx: 0.5 }
const torrent = (over: Partial<Parameters<typeof computeZenScore>[0]>) => ({
  category: "",
  seeding_time: DAY,
  num_complete: 0,
  size: GB,
  ...over,
})

describe("computeZenScore", () => {
  it("matches the example: apps, 6.5 GB, 43 seeders, 10 days", () => {
    expect(computeZenScore(torrent({ category: "apps", size: 6.5 * GB, num_complete: 43, seeding_time: 10 * DAY }), values)).toBe(1.45)
  })

  it("has no score before the torrent has seeded", () => {
    expect(computeZenScore(torrent({ seeding_time: 0 }), values)).toBeNull()
  })

  it("uses 0.5 for xxx and 1.0 otherwise", () => {
    expect(computeZenScore(torrent({ category: "xxx" }), values)).toBe(0.5)
    expect(computeZenScore(torrent({ category: "anything" }), values)).toBe(1)
  })

  it.each([
    [6, 1],
    [7, 1.1],
    [29, 1.1],
    [30, 1.25],
    [89, 1.25],
    [90, 1.35],
    [179, 1.35],
    [180, 1.5],
  ])("seeding duration of %i days scores %f", (days, expected) => {
    expect(computeZenScore(torrent({ seeding_time: days * DAY }), values)).toBe(expected)
  })

  it.each([
    [40, GB, 1],
    [41, GB - 1, 1.2],
    [200, GB, 1.35],
    [41, 50 * GB, 1.35],
    [41, 50 * GB + 1, 1.5],
    [201, 100 * GB, 1.35],
    [250, GB, 1.35],
    [251, GB, 1],
    [-1, GB, 1],
  ])("%i seeders at %i bytes scores %f", (seeders, size, expected) => {
    expect(computeZenScore(torrent({ num_complete: seeders, size }), values)).toBe(expected)
  })
})

describe("computeZenCoef", () => {
  const MB = 1e6
  const DECIMAL_GB = 1e9

  it.each([
    [1 * MB, 0.06],
    [100 * MB, 0.08],
    [500 * MB, 0.18],
    [1 * DECIMAL_GB, 0.29],
    [4 * DECIMAL_GB, 1],
    [25 * DECIMAL_GB, 1.24],
    [60 * DECIMAL_GB, 1.38],
  ])("matches the listed value at %i bytes", (size, expected) => {
    expect(computeZenCoef(size)).toBeCloseTo(expected, 1)
  })

  it("is (size + 0.25 GB) / 4.25 GB up to 4 GB", () => {
    expect(computeZenCoef(0)).toBeCloseTo(0.25 / 4.25, 10)
    expect(computeZenCoef(2 * DECIMAL_GB)).toBeCloseTo(2.25 / 4.25, 10)
    expect(computeZenCoef(4 * DECIMAL_GB)).toBe(1)
  })

  it("grows with the size and has no jump at 4 GB", () => {
    const sizes = [0, 2 * MB, 50 * MB, 300 * MB, 2 * DECIMAL_GB, 3.99 * DECIMAL_GB, 4.01 * DECIMAL_GB, 10 * DECIMAL_GB, 500 * DECIMAL_GB]
    const coefs = sizes.map(computeZenCoef)
    expect(coefs).toEqual([...coefs].sort((a, b) => a - b))
    expect(computeZenCoef(4.01 * DECIMAL_GB) - computeZenCoef(3.99 * DECIMAL_GB)).toBeLessThan(0.01)
  })
})

describe("parseZenCategoryValues", () => {
  it("keeps numeric values and drops the rest", () => {
    expect(parseZenCategoryValues('{"a":2,"b":"x","c":0.5}')).toEqual({ a: 2, c: 0.5 })
  })

  it("rejects a value that is not an object", () => {
    expect(() => parseZenCategoryValues("[1]")).toThrow()
    expect(() => parseZenCategoryValues("nope")).toThrow()
  })
})
