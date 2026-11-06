/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

interface ZenRangeFilterProps {
  /** Accordion value, also the id prefix of the inputs. */
  value: string
  title: string
  min?: number
  max?: number
  /** Hint for the empty upper bound, such as "2" or "2+". */
  maxPlaceholder: string
  onChange: (min: number | undefined, max: number | undefined) => void
  triggerClassName: string
  contentClassName: string
}

// An empty or unreadable text clears the bound.
function parseBound(text: string): number | undefined {
  if (text.trim() === "") return undefined
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

/** A sidebar section with a minimum and a maximum box for one Zen metric. */
export function ZenRangeFilter({
  value,
  title,
  min,
  max,
  maxPlaceholder,
  onChange,
  triggerClassName,
  contentClassName,
}: ZenRangeFilterProps) {
  const { t } = useTranslation("torrents")
  const active = min !== undefined || max !== undefined

  // The boxes keep what the user typed and commit on blur or Enter; the key
  // remounts them when the filter changes from outside, such as a clear.
  const boundKey = `${min ?? ""}|${max ?? ""}`
  const commit = (field: "min" | "max", text: string) => {
    const next = parseBound(text)
    if (field === "min" ? next === min : next === max) return
    onChange(field === "min" ? next : min, field === "max" ? next : max)
  }

  const input = (field: "min" | "max") => (
    <Input
      key={`${field}-${boundKey}`}
      id={`${value}-${field}`}
      aria-label={`${title} ${t(field === "min" ? "filterSidebar.rangeMin" : "filterSidebar.rangeMax")}`}
      type="number"
      inputMode="decimal"
      min={0}
      step="0.05"
      className="h-7 text-xs"
      placeholder={field === "min" ? "0" : maxPlaceholder}
      defaultValue={(field === "min" ? min : max) ?? ""}
      onBlur={(e) => commit(field, e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(field, e.currentTarget.value)
      }}
    />
  )

  return (
    <AccordionItem value={value} className="border rounded-lg">
      <AccordionTrigger className={cn(triggerClassName, "hover:no-underline")}>
        <div className="flex items-center justify-between w-full">
          <span className="text-sm font-medium">{title}</span>
          {active && (
            <Badge
              variant="secondary"
              className="ml-2 h-5 px-1.5 text-xs cursor-pointer hover:bg-secondary/80"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                onChange(undefined, undefined)
              }}
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <X className="size-3" />
                {1}
              </span>
            </Badge>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className={contentClassName}>
        <div className="flex items-center gap-2">
          {input("min")}
          <span aria-hidden="true" className="h-px w-2 shrink-0 bg-muted-foreground" />
          {input("max")}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
