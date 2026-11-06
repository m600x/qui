/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

interface DuplicateInstanceFiltersProps {
  duplicatesOnly: boolean
  onDuplicatesChange: (duplicatesOnly: boolean) => void
  instances: Array<{ id: number; name: string }>
  selectedInstanceIds: number[]
  onInstancesChange: (instanceIds: number[]) => void
  triggerClassName: string
  contentClassName: string
}

/** Unified-view sidebar sections: the duplicate toggle and the instance selector. */
export function DuplicateInstanceFilters({
  duplicatesOnly,
  onDuplicatesChange,
  instances,
  selectedInstanceIds,
  onInstancesChange,
  triggerClassName,
  contentClassName,
}: DuplicateInstanceFiltersProps) {
  const { t } = useTranslation("torrents")

  const toggleInstance = (id: number, checked: boolean) => {
    const next = checked ? [...selectedInstanceIds, id] : selectedInstanceIds.filter(selected => selected !== id)
    onInstancesChange(next)
  }

  const clearBadge = (count: number, onClear: () => void) => (
    <Badge
      variant="secondary"
      className="ml-2 h-5 px-1.5 text-xs cursor-pointer hover:bg-secondary/80"
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation()
        onClear()
      }}
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <X className="size-3" />
        {count}
      </span>
    </Badge>
  )

  return (
    <>
      <AccordionItem value="duplicates" className="border rounded-lg">
        <AccordionTrigger className={cn(triggerClassName, "hover:no-underline")}>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-medium">{t("filterSidebar.duplicates")}</span>
            {duplicatesOnly && clearBadge(1, () => onDuplicatesChange(false))}
          </div>
        </AccordionTrigger>
        <AccordionContent className={contentClassName}>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>{t("filterSidebar.duplicatesToggle")}</span>
              <Switch checked={duplicatesOnly} onCheckedChange={onDuplicatesChange} />
            </label>
            <p className="text-xs text-muted-foreground">{t("filterSidebar.duplicatesHint")}</p>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="instances" className="border rounded-lg">
        <AccordionTrigger className={cn(triggerClassName, "hover:no-underline")}>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-medium">{t("filterSidebar.instances")}</span>
            {selectedInstanceIds.length > 0 && clearBadge(selectedInstanceIds.length, () => onInstancesChange([]))}
          </div>
        </AccordionTrigger>
        <AccordionContent className={contentClassName}>
          <div className="space-y-1.5">
            {instances.map(instance => (
              <label key={instance.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selectedInstanceIds.includes(instance.id)}
                  onCheckedChange={checked => toggleInstance(instance.id, checked === true)}
                />
                <span className="truncate">{instance.name}</span>
              </label>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  )
}
