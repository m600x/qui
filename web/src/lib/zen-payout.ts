/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

// The c411 payout: round(T × P × S × I ÷ 7 × (1 + B)), where T is the number of
// counted torrents, P the share of the day they were shared, S their average
// weight coefficient, I their average score, and B the bonus.

const PAYOUT_SCALE = 7
const SECONDS_PER_DAY = 24 * 60 * 60

export interface ZenPayoutSettings {
  /** The bonus B, in percent. */
  bonusPercent: number
  /** The number of counted torrents T, when the site counts differently from the torrents found here. */
  countedTorrents?: number
}

export const DEFAULT_ZEN_PAYOUT_SETTINGS: ZenPayoutSettings = { bonusPercent: 36 }

export function parseZenPayoutSettings(raw: string): ZenPayoutSettings {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== "object" || parsed === null) throw new Error("not an object")
  const { bonusPercent, countedTorrents } = parsed as Record<string, unknown>
  return {
    bonusPercent: typeof bonusPercent === "number" && Number.isFinite(bonusPercent) ? bonusPercent : DEFAULT_ZEN_PAYOUT_SETTINGS.bonusPercent,
    countedTorrents: typeof countedTorrents === "number" && Number.isFinite(countedTorrents) && countedTorrents > 0 ? countedTorrents : undefined,
  }
}

/** The share of the local day that has passed, from 0 to 1. */
export function dayShare(now: Date): number {
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  return seconds / SECONDS_PER_DAY
}

export interface ZenPayout {
  counted: number
  averageCoef: number
  averageScore: number
  /** The payout for the part of the day that has passed, as if every counted torrent was shared all of it. */
  soFar: number
  /** The payout for the whole day, if nothing changes until midnight. */
  projected: number
}

/** The payout, or null when no torrent counts. */
export function computeZenPayout(
  found: { count: number; scoreSum: number; coefSum: number },
  settings: ZenPayoutSettings,
  share: number
): ZenPayout | null {
  if (found.count <= 0) return null
  const counted = settings.countedTorrents ?? found.count
  const averageCoef = found.coefSum / found.count
  const averageScore = found.scoreSum / found.count
  const wholeDay = (counted * averageCoef * averageScore) / PAYOUT_SCALE * (1 + settings.bonusPercent / 100)
  return {
    counted,
    averageCoef,
    averageScore,
    soFar: Math.round(wholeDay * share),
    projected: Math.round(wholeDay),
  }
}
