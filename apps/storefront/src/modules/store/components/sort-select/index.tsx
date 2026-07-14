"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import { FilterSelect } from "@modules/common/components/filter-field"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

const options: { value: SortOptions; label: string }[] = [
  { value: "created_at", label: "Latest arrivals" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
]

export default function SortSelect({
  sortBy,
  "data-testid": dataTestId,
}: {
  sortBy: SortOptions
  "data-testid"?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const onChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set("sortBy", value)
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  return (
    <label className="flex items-center gap-2.5 shrink-0">
      <span
        className="font-mono text-[11px] tracking-[.14em] uppercase hidden xsmall:inline"
        style={{ color: "var(--text-muted)" }}
      >
        Sort by
      </span>
      <FilterSelect
        value={sortBy}
        onChange={(v) => onChange(v)}
        options={options}
        aria-label="Sort products"
        data-testid={dataTestId}
      />
    </label>
  )
}
