"use client"

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react"

/**
 * Shared filter form fields (chat FilterPanel, category GridFilters, store
 * SortSelect). FilterSelect is a Headless UI listbox instead of a native
 * <select>: the options panel is rendered by us with the design tokens, so
 * it looks identical in every browser and theme (native <option> popups
 * can't be styled cross-browser, notably in Safari).
 */

const base =
  "h-10 rounded-xl border text-[13.5px] font-medium outline-none transition-colors duration-200 focus:[border-color:var(--text)]"

const tokens: React.CSSProperties = {
  borderColor: "var(--line-strong)",
  background: "var(--card)",
  color: "var(--text)",
}

export function FilterInput({
  className = "",
  style,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`${base} px-3 appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${className}`}
      style={{ ...tokens, ...style }}
      {...props}
    />
  )
}

export function FilterSelect({
  value,
  options,
  onChange,
  wrapperClassName = "",
  className = "",
  ...buttonProps
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  wrapperClassName?: string
  className?: string
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "onChange" | "className"
>) {
  const selected = options.find((o) => o.value === value) ?? options[0]

  return (
    <Listbox value={value} onChange={onChange}>
      <div className={`relative inline-grid ${wrapperClassName}`}>
        <ListboxButton
          className={`${base} w-full cursor-pointer pl-3 pr-8 text-left ${className}`}
          style={tokens}
          {...buttonProps}
        >
          <span className="block truncate">{selected?.label}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="z-[70] mt-1 max-h-60 w-[var(--button-width)] overflow-auto rounded-xl border p-1 [--anchor-gap:4px] focus:outline-none"
          style={{
            borderColor: "var(--line-strong)",
            background: "var(--card)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {options.map((o) => (
            <ListboxOption
              key={o.value}
              value={o.value}
              className="cursor-pointer rounded-lg px-2.5 py-2 text-[13.5px] font-medium data-[focus]:bg-[var(--surface-2)] data-[selected]:font-semibold"
              style={{ color: "var(--text)" }}
            >
              {o.label}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
