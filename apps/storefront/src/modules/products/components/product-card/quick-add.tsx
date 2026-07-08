"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { addToCart } from "@lib/data/cart"
import { toast } from "sonner"

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
  const router = useRouter()
  const countryCode = params.countryCode as string

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!variantId) {
      // Several variants: size/color must be picked on the product page
      toast.info("Choose your size and color on the product page")
      router.push(`/${countryCode}/products/${productHandle}`)
      return
    }

    if (state !== "idle") return
    setState("adding")

    try {
      await addToCart({ variantId, quantity: 1, countryCode })
      setState("added")
      toast.success("Added to cart", { duration: 3000 })
      setTimeout(() => setState("idle"), 1400)
    } catch {
      setState("idle")
      toast.error("Could not add to cart")
    }
  }

  const iconClass = compact
    ? "w-[15px] h-[15px] pointer-events-none"
    : "w-[21px] h-[21px] pointer-events-none"

  return (
    <button
      onClick={handleClick}
      aria-label={`Add ${productTitle} to cart`}
      className={`atc-btn absolute grid place-items-center border-none cursor-pointer z-[2] shrink-0 text-[var(--bg)] shadow-[0_4px_16px_rgba(0,0,0,.16)] ${
        compact
          ? "right-[6px] bottom-[6px] w-8 h-8 rounded-[10px]"
          : "right-3 bottom-3 w-[42px] h-[42px] rounded-2xl"
      } ${state === "added" ? "bg-[var(--clr-success)]" : "bg-[var(--text)]"}`}
    >
      {state === "added" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          className={iconClass}
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
          className={iconClass}
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
