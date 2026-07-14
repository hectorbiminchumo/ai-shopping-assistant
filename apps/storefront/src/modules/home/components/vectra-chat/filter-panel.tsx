import { ChatFilters } from "@lib/api"
import {
  FilterInput,
  FilterSelect,
} from "@modules/common/components/filter-field"

/**
 * Filter panel for the conversational search. Fully controlled: edits go
 * straight to the parent's filters state and are sent with the NEXT user
 * message (never re-run the current results). Only imported from the
 * VectraChat client component, so it needs no "use client" of its own.
 */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[10.5px] tracking-[.14em] uppercase"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </span>
  )
}

export default function FilterPanel({
  filters,
  categories,
  sizes,
  onChange,
}: {
  filters: ChatFilters
  categories: string[]
  sizes: string[]
  onChange: (filters: ChatFilters) => void
}) {
  const setPrice = (key: "priceMin" | "priceMax", raw: string) => {
    const num = raw === "" ? undefined : Number(raw)
    onChange({
      ...filters,
      [key]: num !== undefined && !Number.isNaN(num) && num >= 0 ? num : undefined,
    })
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 rounded-2xl border p-4 small:grid-cols-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      data-testid="chat-filter-panel"
    >
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Min price</FieldLabel>
        <FilterInput
          type="number"
          min={0}
          inputMode="decimal"
          placeholder="0"
          value={filters.priceMin ?? ""}
          onChange={(e) => setPrice("priceMin", e.target.value)}
          data-testid="chat-filter-price-min"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Max price</FieldLabel>
        <FilterInput
          type="number"
          min={0}
          inputMode="decimal"
          placeholder="Any"
          value={filters.priceMax ?? ""}
          onChange={(e) => setPrice("priceMax", e.target.value)}
          data-testid="chat-filter-price-max"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Category</FieldLabel>
        <FilterSelect
          value={filters.category ?? ""}
          onChange={(v) => onChange({ ...filters, category: v || undefined })}
          options={[
            { value: "", label: "All categories" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          aria-label="Category"
          data-testid="chat-filter-category"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Size</FieldLabel>
        <FilterSelect
          value={filters.size ?? ""}
          onChange={(v) => onChange({ ...filters, size: v || undefined })}
          options={[
            { value: "", label: "Any size" },
            ...sizes.map((s) => ({ value: s, label: s })),
          ]}
          aria-label="Size"
          data-testid="chat-filter-size"
        />
      </div>
    </div>
  )
}
