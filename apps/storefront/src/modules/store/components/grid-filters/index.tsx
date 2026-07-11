"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  FilterInput,
  FilterSelect,
} from "@modules/common/components/filter-field"

/**
 * Price/size filters for the category product grid. Values live in the URL
 * (minPrice, maxPrice, size) so they survive navigation and pagination;
 * committing a change resets the page param. Price inputs commit on blur or
 * Enter to avoid a server round-trip per keystroke.
 */

export default function GridFilters({ sizes }: { sizes: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const minParam = searchParams.get("minPrice") ?? ""
  const maxParam = searchParams.get("maxPrice") ?? ""
  const sizeParam = searchParams.get("size") ?? ""

  // Local draft for the price inputs; committed on blur/Enter
  const [min, setMin] = useState(minParam)
  const [max, setMax] = useState(maxParam)

  // Re-sync drafts when the URL changes from elsewhere (tags, back button)
  useEffect(() => setMin(minParam), [minParam])
  useEffect(() => setMax(maxParam), [maxParam])

  const commit = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams)
      for (const [name, value] of Object.entries(updates)) {
        const isValid =
          name === "size"
            ? !!value
            : !!value && !Number.isNaN(Number(value)) && Number(value) >= 0
        if (isValid) {
          params.set(name, value)
        } else {
          params.delete(name)
        }
      }
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  const hasActive = !!(minParam || maxParam || sizeParam)

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <span
        className="font-mono text-[11px] tracking-[.14em] uppercase hidden xsmall:inline"
        style={{ color: "var(--text-muted)" }}
      >
        Filter
      </span>
      <FilterInput
        type="number"
        min={0}
        inputMode="decimal"
        placeholder="Min"
        aria-label="Minimum price"
        value={min}
        onChange={(e) => setMin(e.target.value)}
        onBlur={() => min !== minParam && commit({ minPrice: min })}
        onKeyDown={(e) => e.key === "Enter" && commit({ minPrice: min })}
        className="w-20"
        data-testid="grid-filter-price-min"
      />
      <FilterInput
        type="number"
        min={0}
        inputMode="decimal"
        placeholder="Max"
        aria-label="Maximum price"
        value={max}
        onChange={(e) => setMax(e.target.value)}
        onBlur={() => max !== maxParam && commit({ maxPrice: max })}
        onKeyDown={(e) => e.key === "Enter" && commit({ maxPrice: max })}
        className="w-20"
        data-testid="grid-filter-price-max"
      />
      {sizes.length > 0 && (
        <FilterSelect
          value={sizeParam}
          onChange={(v) => commit({ size: v })}
          options={[
            { value: "", label: "Any size" },
            ...sizes.map((s) => ({ value: s, label: s })),
          ]}
          aria-label="Filter by size"
          data-testid="grid-filter-size"
        />
      )}
      {hasActive && (
        <button
          onClick={() => commit({ minPrice: "", maxPrice: "", size: "" })}
          className="text-[12.5px] font-medium underline underline-offset-2 cursor-pointer"
          style={{ color: "var(--text-muted)", background: "none", border: "none" }}
          data-testid="grid-filter-clear"
        >
          Clear
        </button>
      )}
    </div>
  )
}
