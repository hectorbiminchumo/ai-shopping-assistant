"use client"

import { useRef } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type Props = {
  eyebrow?: string
  title: string
  viewAllHref?: string
  background?: string
  trackClassName?: string
  children: React.ReactNode
}

export default function RailSection({
  eyebrow,
  title,
  viewAllHref,
  background = "var(--bg)",
  trackClassName = "",
  children,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 1 | -1) => {
    const track = trackRef.current
    if (!track) return
    const card = track.querySelector("li") as HTMLElement | null
    const amount = card ? card.offsetWidth + 22 : 280
    track.scrollBy({ left: dir * amount, behavior: "smooth" })
  }

  const IconBtn = ({ dir, label }: { dir: 1 | -1; label: string }) => (
    <button
      onClick={() => scroll(dir)}
      aria-label={label}
      style={{
        width: 42,
        height: 42,
        border: "1px solid var(--line)",
        borderRadius: 16,
        background: "var(--bg)",
        color: "var(--text)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        transition: "background .2s, border-color .2s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--surface-2)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--bg)")
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        style={{ width: 21, height: 21 }}
      >
        {dir === -1 ? (
          <path d="M15 6l-6 6 6 6" />
        ) : (
          <path d="M9 6l6 6-6 6" />
        )}
      </svg>
    </button>
  )

  return (
    <section
      aria-labelledby={`rail-${title.replace(/\s+/g, "-").toLowerCase()}`}
      className="v-reveal"
      style={{
        paddingBlock: "clamp(56px, 7vw, 96px)",
        background,
      }}
    >
      <div
        className="max-w-[1280px] mx-auto"
        style={{ paddingInline: "var(--pad)" }}
      >
        {/* Header row */}
        <div className="flex items-end justify-between gap-6 mb-[34px]">
          <div>
            {eyebrow && (
              <span
                className="block font-mono text-[11px] tracking-[.18em] uppercase mb-2.5"
                style={{ color: "var(--text-muted)" }}
              >
                {eyebrow}
              </span>
            )}
            <h2
              id={`rail-${title.replace(/\s+/g, "-").toLowerCase()}`}
              className="m-0 font-bold"
              style={{
                fontSize: "clamp(26px, 3vw, 38px)",
                letterSpacing: "-0.025em",
                color: "var(--text)",
              }}
            >
              {title}
            </h2>
          </div>

          {/* Right side: arrows + optional View all */}
          <div className="flex items-center gap-4 shrink-0">
            {viewAllHref && (
              <LocalizedClientLink
                href={viewAllHref}
                className="text-sm font-medium whitespace-nowrap pb-0.5 border-b transition-colors duration-200"
                style={{ color: "var(--text-muted)", borderColor: "var(--line)" }}
              >
                View all
              </LocalizedClientLink>
            )}
            <div className="flex gap-2">
              <IconBtn dir={-1} label={`Previous ${title}`} />
              <IconBtn dir={1} label={`Next ${title}`} />
            </div>
          </div>
        </div>

        {/* Scroll track */}
        <div
          ref={trackRef}
          className={`overflow-x-auto no-scrollbar ${trackClassName}`}
          style={{ scrollSnapType: "x mandatory" }}
        >
          <ul
            className="flex gap-[22px] pb-1"
            style={{ margin: 0, padding: 0, listStyle: "none" }}
          >
            {children}
          </ul>
        </div>
      </div>
    </section>
  )
}
