/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useClientSetting } from "@/lib/client-settings"
import {
  computeZenPayout,
  dayShare,
  DEFAULT_ZEN_PAYOUT_SETTINGS,
  parseZenPayoutSettings,
  type ZenPayoutSettings,
} from "@/lib/zen-payout"
import { aggregateZenDistribution } from "@/lib/zen-score-charts"
import type { TorrentStats } from "@/types"
import { Coins } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

const SETTINGS_KEY = "qui-zen-payout-settings"
const REFRESH_MS = 30_000

/** The estimated c411 payout so far today, and for the whole day if nothing changes. */
export function ZenPayoutCard({ stats }: { stats: Array<TorrentStats | null | undefined> }) {
  const { t } = useTranslation("dashboard")
  const [settings, setSettings] = useClientSetting<ZenPayoutSettings>(SETTINGS_KEY, {
    defaultValue: DEFAULT_ZEN_PAYOUT_SETTINGS,
    parse: parseZenPayoutSettings,
  })
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const found = useMemo(() => {
    const data = aggregateZenDistribution(stats)
    return { count: data.count, scoreSum: data.scoreSum, coefSum: data.coefSum }
  }, [stats])
  const share = dayShare(now)
  const payout = computeZenPayout(found, settings, share)
  const integer = new Intl.NumberFormat()

  if (!payout) return null

  // Boxes commit on blur or Enter; the key remounts them when a value changes from outside.
  const commitBonus = (text: string) => {
    const value = Number(text)
    if (text.trim() === "" || !Number.isFinite(value) || value < 0 || value === settings.bonusPercent) return
    setSettings({ ...settings, bonusPercent: value })
  }
  const commitCounted = (text: string) => {
    const value = Number(text)
    const next = text.trim() === "" || !Number.isFinite(value) || value <= 0 ? undefined : Math.round(value)
    if (next === settings.countedTorrents) return
    setSettings({ ...settings, countedTorrents: next })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("zenPayout.title")}</CardTitle>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardDescription>
          {t("zenPayout.formula", {
            counted: integer.format(payout.counted),
            share: (share * 100).toFixed(1),
            coef: payout.averageCoef.toFixed(3),
            score: payout.averageScore.toFixed(3),
            bonus: settings.bonusPercent,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-3xl font-bold tabular-nums">{integer.format(payout.soFar)}</div>
            <p className="text-xs text-muted-foreground">{t("zenPayout.soFar")}</p>
          </div>
          <div>
            <div className="text-3xl font-bold tabular-nums text-muted-foreground">{integer.format(payout.projected)}</div>
            <p className="text-xs text-muted-foreground">{t("zenPayout.projected")}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="zen-payout-bonus" className="text-xs">{t("zenPayout.bonus")}</Label>
            <Input
              key={`bonus-${settings.bonusPercent}`}
              id="zen-payout-bonus"
              type="number"
              min={0}
              step="1"
              className="h-8"
              defaultValue={settings.bonusPercent}
              onBlur={(e) => commitBonus(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitBonus(e.currentTarget.value)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="zen-payout-counted" className="text-xs">{t("zenPayout.counted")}</Label>
            <Input
              key={`counted-${settings.countedTorrents ?? ""}`}
              id="zen-payout-counted"
              type="number"
              min={1}
              step="1"
              className="h-8"
              placeholder={String(found.count)}
              defaultValue={settings.countedTorrents ?? ""}
              onBlur={(e) => commitCounted(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitCounted(e.currentTarget.value)
              }}
            />
            <p className="text-[11px] text-muted-foreground">{t("zenPayout.countedHint", { count: found.count })}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
