"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AskVectraButton from "@modules/home/components/hero/ask-vectra-button"

const NOTCH = 36
const SLIDES = [
  { src: "/banners/slider1.png", webp: "/banners/slider1.webp", eyebrow: "Road running", headline: "Own the road" },
  { src: "/banners/slider2.png", webp: "/banners/slider2.webp", eyebrow: "Swim", headline: "Cut through water" },
  { src: "/banners/slider3.png", webp: "/banners/slider3.webp", eyebrow: "Track", headline: "Hold the line" },
]

export default function Hero() {
  const [active, setActive] = useState(0)

  // Auto-advance, unless the user prefers reduced motion
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const t = setInterval(
      () => setActive((p) => (p + 1) % SLIDES.length),
      5000
    )
    return () => clearInterval(t)
  }, [])

  return (
    <section
      aria-label="Hero"
      className="relative w-full overflow-hidden"
      style={{ minHeight: 440, maxHeight: 660 }}
    >
      {/* Background slider — crossfading branded athletic banners */}
      {SLIDES.map((slide, i) => (
        <div
          key={slide.src}
          className="absolute inset-0"
          style={{
            opacity: i === active ? 1 : 0,
            transition: "opacity 1s var(--ease)",
            backgroundColor: "#0a0a09",
          }}
          aria-hidden="true"
        >
          <Image
            src={slide.webp}
            alt=""
            fill
            priority={i === 0}
            fetchPriority={i === 0 ? "high" : undefined}
            className="object-cover"
            sizes="100vw"
          />
        </div>
      ))}

      {/* Left gradient text shade */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.18) 50%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      {/* Content wrapper */}
      <div
        className="relative flex items-end"
        style={{
          minHeight: "inherit",
          maxHeight: "inherit",
          aspectRatio: "21/9",
          paddingBlock: 42,
          paddingInline: "var(--pad)",
        }}
      >
        {/* Notch card */}
        <div
          className="v-enter"
          style={{
            width: "min(420px, 78vw)",
            color: "var(--text)",
            boxShadow: "var(--shadow-lg)",
            clipPath: `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% ${NOTCH}px, 100% 100%, 0 100%)`,
            borderRadius: 8,
            overflow: "hidden",
            position: "relative",
            zIndex: 3,
          }}
        >
          {/* Frosted top band */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 22px",
              background: "rgba(250,250,250,.22)",
              backdropFilter: "blur(13px) saturate(1.3)",
              WebkitBackdropFilter: "blur(13px) saturate(1.3)",
              borderBottom: "1px solid rgba(255,255,255,.3)",
              color: "#fff",
            }}
          >
            <span className="font-mono text-[11px] tracking-[.18em] uppercase opacity-90">
              {SLIDES[active].eyebrow}
            </span>
            <span className="font-mono text-[11px] tracking-[.18em] uppercase font-bold opacity-90">
              SS 2026
            </span>
            {/* Offset for the notch */}
            <span
              className="w-[26px] h-[26px] rounded-full border border-white/60 grid place-items-center text-base opacity-60"
              style={{ marginRight: NOTCH - 12 }}
              aria-hidden="true"
            >
              +
            </span>
          </div>

          {/* Solid body */}
          <div
            style={{
              background: "var(--card)",
              padding: "22px 28px 22px",
            }}
          >
            <h1
              key={active}
              className="v-enter font-bold leading-none m-0 mb-4"
              style={{
                fontSize: "clamp(28px, 3.2vw, 42px)",
                letterSpacing: "-0.03em",
                color: "var(--text)",
              }}
            >
              {SLIDES[active].headline}
            </h1>
            <div className="flex gap-2">
              <LocalizedClientLink
                href="/store"
                className="inline-flex items-center justify-center h-12 px-6 rounded-[16px] text-sm font-semibold tracking-tight transition-colors duration-200"
                style={{
                  background: "var(--btn-pri-bg)",
                  color: "var(--btn-pri-fg)",
                }}
              >
                Shop now
              </LocalizedClientLink>
              <AskVectraButton />
            </div>
          </div>
        </div>
      </div>

      {/* Slider dots */}
      <div
        className="absolute z-[4] flex items-center gap-2"
        style={{ right: "var(--pad)", bottom: 20 }}
        role="tablist"
        aria-label="Hero slides"
      >
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-selected={i === active}
            role="tab"
            style={{
              height: 8,
              width: i === active ? 22 : 8,
              borderRadius: 999,
              background: i === active ? "#fff" : "rgba(255,255,255,.5)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width .3s var(--ease), background .3s var(--ease)",
            }}
          />
        ))}
      </div>
    </section>
  )
}
