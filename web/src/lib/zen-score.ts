/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { useSyncExternalStore } from "react"
import { CLIENT_SETTING_CHANGE_EVENT, readRaw, useClientSetting } from "@/lib/client-settings"
import type { Torrent } from "@/types"

// Keep the rules in step with ZenScore in internal/qbittorrent/zen_score.go:
// the server sorts by that score, this file displays it.

export type ZenCategoryValues = Record<string, number>

export const ZEN_SCORE_SETTING_PREFIX = "qui-zen-score-categories:"

const DEFAULT_CATEGORY_VALUE = 1
const SECONDS_PER_DAY = 24 * 60 * 60
const BYTES_PER_GB = 1024 ** 3

const DEFAULT_CATEGORY_VALUES: ZenCategoryValues = { xxx: 0.5 }

export function zenScoreSettingKey(instanceId: number): string {
  return `${ZEN_SCORE_SETTING_PREFIX}${instanceId}`
}

export function parseZenCategoryValues(raw: string): ZenCategoryValues {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object")
  const values: ZenCategoryValues = {}
  for (const [category, value] of Object.entries(parsed)) {
    if (typeof value === "number" && Number.isFinite(value)) values[category] = value
  }
  return values
}

// Stored values apply as written; an instance with none stored uses the defaults.
const parsedByRaw = new Map<string, ZenCategoryValues>()

export function readZenCategoryValues(instanceId: number): ZenCategoryValues {
  const raw = readRaw(zenScoreSettingKey(instanceId))
  if (raw == null || raw === "") return DEFAULT_CATEGORY_VALUES
  let values = parsedByRaw.get(raw)
  if (!values) {
    try {
      values = parseZenCategoryValues(raw)
    } catch {
      values = DEFAULT_CATEGORY_VALUES
    }
    parsedByRaw.set(raw, values)
  }
  return values
}

/** The Zen Score of a torrent, or null while it has not seeded yet. */
export function computeZenScore(
  torrent: Pick<Torrent, "category" | "seeding_time" | "num_complete" | "size">,
  categoryValues: ZenCategoryValues
): number | null {
  if (torrent.seeding_time <= 0) return null

  let score = categoryValues[torrent.category] ?? DEFAULT_CATEGORY_VALUE

  const days = torrent.seeding_time / SECONDS_PER_DAY
  if (days >= 180) score += 0.5
  else if (days >= 90) score += 0.35
  else if (days >= 30) score += 0.25
  else if (days >= 7) score += 0.1

  const seeders = torrent.num_complete
  if (seeders >= 41 && seeders <= 200) {
    if (torrent.size < BYTES_PER_GB) score += 0.2
    else if (torrent.size <= 50 * BYTES_PER_GB) score += 0.35
    else score += 0.5
  } else if (seeders >= 201 && seeders <= 250) {
    score += 0.35
  }

  // Drop the float noise of the sum, as in 1 + 0.1 + 0.35.
  return Math.round(score * 100) / 100
}

// Sizes here are decimal: 1 GB is 1000 MB, the unit the coefficient was set in.
const COEF_GB = 1e9
const COEF_REFERENCE_GB = 4
const COEF_SMALL_BONUS_GB = 0.25
// Fitted to 1.24 at 25 GB and 1.38 at 60 GB.
const COEF_LARGE_EXPONENT = 0.118

/**
 * The Zen coefficient of a size in bytes. Up to 4 GB it is (size + 0.25 GB) / 4.25 GB,
 * which is 1 at 4 GB. Above that it is (size / 4 GB) ^ 0.118. It grows with the size,
 * so sorting by size sorts by it.
 */
export function computeZenCoef(sizeBytes: number): number {
  const gb = Math.max(sizeBytes, 0) / COEF_GB
  if (gb <= COEF_REFERENCE_GB) {
    return (gb + COEF_SMALL_BONUS_GB) / (COEF_REFERENCE_GB + COEF_SMALL_BONUS_GB)
  }
  return (gb / COEF_REFERENCE_GB) ** COEF_LARGE_EXPONENT
}

/** A torrent's Zen Score times its own Zen coefficient, or null while it has no score. */
export function computeZenScoreCoef(
  torrent: Pick<Torrent, "category" | "seeding_time" | "num_complete" | "size">,
  categoryValues: ZenCategoryValues
): number | null {
  const score = computeZenScore(torrent, categoryValues)
  return score === null ? null : score * computeZenCoef(torrent.size)
}

/** Category values of one instance, as a synced client setting. */
export function useZenCategoryValues(instanceId: number) {
  return useClientSetting<ZenCategoryValues>(zenScoreSettingKey(instanceId), {
    defaultValue: DEFAULT_CATEGORY_VALUES,
    parse: parseZenCategoryValues,
  })
}

// Moves when any instance's values change, so memoized columns can rebuild.
let settingsVersion = 0
const versionListeners = new Set<() => void>()

if (typeof window !== "undefined") {
  const bump = (key: string | null | undefined) => {
    if (key != null && !key.startsWith(ZEN_SCORE_SETTING_PREFIX)) return
    settingsVersion++
    versionListeners.forEach((listener) => listener())
  }
  window.addEventListener(CLIENT_SETTING_CHANGE_EVENT, (e) => bump((e as CustomEvent<{ key?: string }>).detail?.key))
  window.addEventListener("storage", (e) => bump(e.key))
}

function subscribeToVersion(callback: () => void): () => void {
  versionListeners.add(callback)
  return () => versionListeners.delete(callback)
}

export function useZenScoreSettingsVersion(): number {
  return useSyncExternalStore(subscribeToVersion, () => settingsVersion)
}
