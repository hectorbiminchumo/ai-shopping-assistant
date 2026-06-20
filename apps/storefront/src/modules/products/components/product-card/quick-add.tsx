"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { addToCart } from "@lib/data/cart"

export default function QuickAdd({
  variantId,
  productHandle,
  productTitle,
  compact = false,
}: {
  variantId: string | null
  productHandle: string
  productTitle: string
  compact?: boolean
}) {
  const [state, setState] = useState<"idle" | "adding" | "added">("idle")
  const params = useParams()
  const countryCode = params.countryCode as string

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!variantId) {
      window.location.href = `/${countryCode}/products/${productHandle}`
      return
    }

    if (state !== "idle") return
    setState("adding")

    try {
      await addToCart({ variantId, quantity: 1, countryCode })
      setState("added")
      setTimeout(() => setState("idle"), 1400)
    } catch {
      setState("idle")
    }
  }

  const size = compact ? 32 : 42
  const br = compact ? 10 : 16
  const icon = compact ? 15 : 21

  return (
    <button
      onClick={handleClick}
      aria-label={`Add ${productTitle} to cart`}
      className="atc-btn"
      style={{
        position: "absolute",
        right: compact ? 6 : 12,
        bottom: compact ? 6 : 12,
        width: size,
        height: size,
        borderRadius: br,
        background: state === "added" ? "var(--clr-success)" : "var(--text)",
        color: "var(--bg)",
        border: "none",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,.16)",
        transition:
          "background .2s, opacity .25s cubic-bezier(.22,.61,.36,1), transform .25s cubic-bezier(.22,.61,.36,1)",
        zIndex: 2,
        flexShrink: 0,
      }}
    >
      {state === "added" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          style={{ width: icon, height: icon, pointerEvents: "none" }}
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          style={{ width: icon, height: icon, pointerEvents: "none" }}
          aria-hidden="true"
        >
          <path d="M6 7h13l-1.2 9.5a2 2 0 01-2 1.7H9.2a2 2 0 01-2-1.7L6 4H3" />
          <circle cx="9" cy="21" r="1" />
          <circle cx="17" cy="21" r="1" />
        </svg>
      )}
    </button>
  )
}
