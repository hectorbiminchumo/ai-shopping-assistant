"use client"

import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useState } from "react"

const PLACEHOLDER = (i: number) =>
  `https://placehold.co/800x1000/f6f6f4/b0b0ab?text=Image+${i + 1}`

export default function PDPGallery({
  images,
  title,
}: {
  images: HttpTypes.StoreProductImage[]
  title: string
}) {
  const [current, setCurrent] = useState(0)

  const slides = images.length
    ? images
    : Array.from({ length: 4 }, (_, i) => ({ id: `ph-${i}`, url: PLACEHOLDER(i) }))

  return (
    <div className="pdp-gallery">
      {/* Track: vertical stack on desktop, single-slide fade on mobile (CSS-driven) */}
      <div className="pdp-gallery__track">
        {slides.map((img, i) => (
          <div
            key={img.id ?? i}
            className={`pdp-gallery__slide${i === current ? " active" : ""}`}
          >
            <Image
              src={img.url ?? PLACEHOLDER(i)}
              alt={`${title} — image ${i + 1}`}
              fill
              priority={i === 0}
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 55vw"
            />
          </div>
        ))}
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
