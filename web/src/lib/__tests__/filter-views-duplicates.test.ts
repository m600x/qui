/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { describe, expect, it } from "vitest"
import { filterViewsEqual, hasSidebarFilters, toViewFilters } from "@/lib/filter-views"

describe("duplicate and instance filters", () => {
  it("count as sidebar filters only when they select something", () => {
    expect(hasSidebarFilters({ duplicatesOnly: true })).toBe(true)
    expect(hasSidebarFilters({ instanceIds: [2] })).toBe(true)
    expect(hasSidebarFilters({ duplicatesOnly: false, instanceIds: [] })).toBe(false)
  })

  it("are kept in a view snapshot, with the instances sorted", () => {
    expect(toViewFilters({ duplicatesOnly: true, instanceIds: [3, 1] })).toMatchObject({ duplicatesOnly: true, instanceIds: [1, 3] })
    expect(toViewFilters({ duplicatesOnly: false, instanceIds: [] })).not.toHaveProperty("duplicatesOnly")
    expect(filterViewsEqual({ duplicatesOnly: false, instanceIds: [] }, undefined)).toBe(true)
    expect(filterViewsEqual({ instanceIds: [1, 3] }, { instanceIds: [3, 1] })).toBe(true)
  })
})
