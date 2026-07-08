"use client"

import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useEffect, useState } from "react"

const PLACEHOLDER = (i: number) =>
  `https://placehold.co/800x1000/f6f6f4/b0b0ab?text=Image+${i + 1}`

// Cursor-following magnify factor
const ZOOM = 2.2

export default function PDPGallery({
  images,
  title,
}: {
  images: HttpTypes.StoreProductImage[]
  title: string
}) {
  const [current, setCurrent] = useState(0)
  const [canZoom, setCanZoom] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setCanZoom(
      window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches
    )
    const mql = window.matchMedia("(max-width: 768px)")
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canZoom) return
    const img = e.currentTarget.querySelector("img") as HTMLElement | null
    if (!img) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    img.style.transformOrigin = `${x}% ${y}%`
    img.style.transform = `scale(${ZOOM})`
  }

  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = e.currentTarget.querySelector("img") as HTMLElement | null
    if (!img) return
    img.style.transform = ""
    img.style.transformOrigin = ""
  }

  const slides = images.length
    ? images
    : Array.from({ length: 4 }, (_, i) => ({ id: `ph-${i}`, url: PLACEHOLDER(i) }))

  return (
    <div className="pdp-gallery">
      {/* Track: vertical stack on desktop, single-slide fade on mobile (CSS-driven) */}
      <div className="pdp-gallery__track">
        {slides.map((img, i) => {
          if (isMobile && i !== current) return null
          return (
          <div
            key={img.id ?? i}
            className={`pdp-gallery__slide${i === current ? " active" : ""}`}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            style={canZoom ? { cursor: "zoom-in" } : undefined}
          >
            <Image
              src={img.url ?? PLACEHOLDER(i)}
              alt={`${title}, image ${i + 1}`}
              fill
              priority={i === 0}
              // priority alone doesn't set fetchpriority=high on the preload
              // in Next 15 — Lighthouse flags the LCP image without it
              fetchPriority={i === 0 ? "high" : undefined}
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 55vw"
            />
          </div>
          )
        })}
      </div>

      {/* Dots: hidden on desktop via CSS, pill-style on mobile */}
      {slides.length > 1 && (
        <div className="pdp-gallery__dots" role="tablist" aria-label="Image navigation">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`pdp-gallery__dot${i === current ? " active" : ""}`}
              onClick={() => setCurrent(i)}
              aria-label={`Image ${i + 1}`}
              aria-selected={i === current}
              role="tab"
            />
          ))}
        </div>
      )}
    </div>
  )
}
