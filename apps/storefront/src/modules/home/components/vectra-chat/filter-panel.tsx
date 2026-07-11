import { ChatFilters } from "@lib/api"

/**
 * Filter panel for the conversational search. Fully controlled: edits go
 * straight to the parent's filters state and are sent with the NEXT user
 * message (never re-run the current results). Only imported from the
 * VectraChat client component, so it needs no "use client" of its own.
 */

const fieldClasses =
  "h-10 w-full rounded-xl border px-3 text-[13.5px] font-medium outline-none transition-colors duration-200 focus:[border-color:var(--text)]"

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--line-strong)",
  background: "var(--card)",
  color: "var(--text)",
}

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
        <input
          type="number"
          min={0}
          inputMode="decimal"
          placeholder="0"
          value={filters.priceMin ?? ""}
          onChange={(e) => setPrice("priceMin", e.target.value)}
          className={fieldClasses}
          style={fieldStyle}
          data-testid="chat-filter-price-min"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Max price</FieldLabel>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          placeholder="Any"
          value={filters.priceMax ?? ""}
          onChange={(e) => setPrice("priceMax", e.target.value)}
          className={fieldClasses}
          style={fieldStyle}
          data-testid="chat-filter-price-max"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Category</FieldLabel>
        <select
          value={filters.category ?? ""}
          onChange={(e) =>
            onChange({ ...filters, category: e.target.value || undefined })
          }
          className={`${fieldClasses} cursor-pointer appearance-none pr-8`}
          style={fieldStyle}
          data-testid="chat-filter-category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Size</FieldLabel>
        <select
          value={filters.size ?? ""}
          onChange={(e) =>
            onChange({ ...filters, size: e.target.value || undefined })
          }
          className={`${fieldClasses} cursor-pointer appearance-none pr-8`}
          style={fieldStyle}
          data-testid="chat-filter-size"
        >
          <option value="">Any size</option>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
