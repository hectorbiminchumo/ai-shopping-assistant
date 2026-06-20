"use client"

import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useState } from "react"

const PLACEHOLDER = (i: number) =>
  `https://placehold.co/800x1000/f6f6f4/6a6a67?text=Image+${i + 1}`

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
    : [{ id: "ph", url: PLACEHOLDER(0) }]

  const prev = () => setCurrent((c) => (c - 1 + slides.length) % slides.length)
  const next = () => setCurrent((c) => (c + 1) % slides.length)

  return (
    <div className="pdp-gallery">
      <div className="pdp-gallery__track">
        {slides.map((img, i) => (
          <div
            key={img.id ?? i}
            className="pdp-gallery__slide"
            style={{ transform: `translateX(${(i - current) * 100}%)`, position: "absolute", inset: 0, transition: "transform .5s cubic-bezier(.22,.61,.36,1)" }}
            aria-hidden={i !== current}
          >
            <Image
              src={img.url ?? PLACEHOLDER(i)}
              alt={`${title} — image ${i + 1}`}
              fill
              priority={i === 0}
              className="object-cover"
              sizes="(max-width: 900px) 100vw, 55vw"
            />
          </div>
        ))}

        {/* Wrapper keeps the aspect ratio */}
        <div className="pdp-gallery__slide" style={{ position: "relative", visibility: "hidden" }} aria-hidden="true" />

        {slides.length > 1 && (
          <>
            <button className="pdp-gallery__arrow pdp-gallery__arrow--prev" onClick={prev} aria-label="Previous image">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M15 6l-6 6 6 6"/></svg>
            </button>
            <button className="pdp-gallery__arrow pdp-gallery__arrow--next" onClick={next} aria-label="Next image">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </>
        )}
      </div>

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
