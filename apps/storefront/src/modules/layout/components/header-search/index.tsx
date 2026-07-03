"use client"

import { useRef, useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"

export default function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [reducedMotion, setReducedMotion] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const params = useParams()
  const countryCode = params.countryCode as string

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mql.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("click", handler)
    document.addEventListener("keydown", keyHandler)
    return () => {
      document.removeEventListener("click", handler)
      document.removeEventListener("keydown", keyHandler)
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      setOpen(false)
      router.push(`/${countryCode}/search?q=${encodeURIComponent(query.trim())}`)
      setQuery("")
    }
  }

  return (
    <div ref={boxRef} style={{ display: "flex", alignItems: "center" }}>
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="search"
          name="q"
          placeholder="Search products…"
          aria-label="Search products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-hidden={!open}
          tabIndex={open ? 0 : -1}
          style={{
            height: 42,
            borderRadius: 16,
            background: "var(--surface-2)",
            color: "var(--text)",
          fontSize: 14,
          fontFamily: "inherit",
          border: 0,
            transition: reducedMotion
              ? "none"
              : "width .25s cubic-bezier(.22,.61,.36,1), padding .25s cubic-bezier(.22,.61,.36,1), opacity .2s cubic-bezier(.22,.61,.36,1)",
            width: open ? 200 : 0,
            padding: open ? "0 14px" : 0,
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            marginRight: open ? 4 : 0,
          }}
        />
      </form>
      <button
        aria-label={open ? "Close search" : "Search"}
        aria-expanded={open}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (open && query.trim()) {
            router.push(`/${countryCode}/search?q=${encodeURIComponent(query.trim())}`)
            setQuery("")
            setOpen(false)
          } else {
            setOpen((v) => !v)
          }
        }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 16,
          display: "grid",
          placeItems: "center",
          color: "var(--text)",
          background: "none",
          border: "none",
          cursor: "pointer",
          transition: "background .2s",
          flexShrink: 0,
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "none")
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          style={{ width: 21, height: 21 }}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      </button>
    </div>
  )
}
