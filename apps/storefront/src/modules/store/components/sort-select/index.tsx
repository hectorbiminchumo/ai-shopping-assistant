"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

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
      <div className="relative">
        <select
          value={sortBy}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Sort products"
          data-testid={dataTestId}
          className="appearance-none cursor-pointer outline-none transition-colors duration-200 focus:[border-color:var(--text)]"
          style={{
            height: 40,
            borderRadius: 12,
            border: "1px solid var(--line-strong)",
            background: "var(--card)",
            color: "var(--text)",
            fontSize: 13.5,
            fontWeight: 500,
            paddingLeft: 14,
            paddingRight: 36,
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </label>
  )
}
