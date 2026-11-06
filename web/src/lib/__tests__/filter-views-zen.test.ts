/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { describe, expect, it } from "vitest"
import { EMPTY_SIDEBAR_FILTERS, filterViewsEqual, hasSidebarFilters, toViewFilters } from "@/lib/filter-views"

describe("Zen range filters", () => {
  it("count as a sidebar filter once a bound is set", () => {
    expect(hasSidebarFilters(EMPTY_SIDEBAR_FILTERS)).toBe(false)
    expect(hasSidebarFilters({ zenScoreMin: 0 })).toBe(true)
    expect(hasSidebarFilters({ zenCoefMax: 1.5 })).toBe(true)
    expect(hasSidebarFilters({ zenScoreMin: undefined, zenCoefMax: undefined })).toBe(false)
  })

  it("are kept in a saved view and left out when unset", () => {
    expect(toViewFilters({ zenScoreMin: 0.5, zenCoefMax: 2 })).toMatchObject({ zenScoreMin: 0.5, zenCoefMax: 2 })
    expect(toViewFilters({ zenScoreMin: undefined })).not.toHaveProperty("zenScoreMin")
    expect(filterViewsEqual({ zenScoreMin: undefined }, undefined)).toBe(true)
    expect(filterViewsEqual({ zenScoreMin: 1 }, undefined)).toBe(false)
  })
})
