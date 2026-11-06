/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useZenCategoryValues, type ZenCategoryValues } from "@/lib/zen-score"
import { useState } from "react"
import { useTranslation } from "react-i18next"

interface ZenScoreSettingsDialogProps {
  instanceId: number
  categories: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ZenScoreSettingsDialog({ instanceId, categories, open, onOpenChange }: ZenScoreSettingsDialogProps) {
  const { t } = useTranslation("torrents")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("zenScore.title")}</DialogTitle>
          <DialogDescription>{t("zenScore.description")}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the form starts from the stored values each time. */}
        <ZenScoreSettingsForm instanceId={instanceId} categories={categories} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ZenScoreSettingsForm({ instanceId, categories, onClose }: { instanceId: number; categories: string[]; onClose: () => void }) {
  const { t } = useTranslation("torrents")
  const [stored, setStored] = useZenCategoryValues(instanceId)
  // Text per category while editing, so a half-typed number stays as typed.
  const [draft, setDraft] = useState<Record<string, string>>(
    () => Object.fromEntries(categories.map((category) => [category, String(stored[category] ?? 1)]))
  )

  const handleSave = () => {
    const values: ZenCategoryValues = {}
    for (const [category, text] of Object.entries(draft)) {
      const value = Number(text)
      // 1.0 is the default of every category, so only the others are stored.
      if (text.trim() !== "" && Number.isFinite(value) && value !== 1) values[category] = value
    }
    setStored(values)
    onClose()
  }

  return (
    <>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {categories.length === 0 && <p className="text-sm text-muted-foreground">{t("zenScore.noCategories")}</p>}
        {categories.map((category) => (
          <div key={category} className="flex items-center justify-between gap-3">
            <Label htmlFor={`zen-score-${category}`} className="truncate">{category}</Label>
            <Input
              id={`zen-score-${category}`}
              aria-label={t("zenScore.categoryValue", { category })}
              type="number"
              step="0.05"
              className="w-24"
              value={draft[category] ?? ""}
              onChange={(e) => setDraft((prev) => ({ ...prev, [category]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t("zenScore.cancel")}</Button>
        <Button onClick={handleSave}>{t("zenScore.save")}</Button>
      </DialogFooter>
    </>
  )
}
