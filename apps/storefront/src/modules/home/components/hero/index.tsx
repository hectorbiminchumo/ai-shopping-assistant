import LocalizedClientLink from "@modules/common/components/localized-client-link"

const NOTCH = 36

export default function Hero() {
  return (
    <section aria-label="Hero" className="relative w-full overflow-hidden" style={{ minHeight: 440, maxHeight: 660 }}>
      {/* Background — athletic dark gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #0a0a09 0%, #1a1a17 45%, #252521 100%)",
        }}
        aria-hidden="true"
      />

      {/* Left gradient text shade */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.18) 50%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      {/* Abstract motion lines — decorative */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute"
            style={{
              top: `${20 + i * 18}%`,
              left: `${30 + i * 12}%`,
              width: `${200 + i * 80}px`,
              height: "1px",
              background: `rgba(255,255,255,${0.03 + i * 0.015})`,
              transform: `rotate(-${8 + i * 3}deg)`,
            }}
          />
        ))}
      </div>

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
            <span
              className="font-mono text-[11px] tracking-[.18em] uppercase opacity-90"
            >
              New Season
            </span>
            <span
              className="font-mono text-[11px] tracking-[.18em] uppercase font-bold opacity-90"
            >
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
              className="font-bold leading-none m-0 mb-4"
              style={{
                fontSize: "clamp(28px, 3.2vw, 42px)",
                letterSpacing: "-0.03em",
                color: "var(--text)",
              }}
            >
              Engineered for&nbsp;motion
            </h1>
            <div className="flex gap-2">
              <LocalizedClientLink
                href="/store"
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-[16px] text-sm font-semibold tracking-tight transition-colors duration-200"
                style={{
                  background: "var(--btn-sec-bg)",
                  color: "var(--btn-sec-fg)",
                }}
              >
                <span
                  className="w-[15px] h-[15px] rounded-full border-[1.5px] border-current grid place-items-center"
                  aria-hidden="true"
                >
                  <span className="w-1 h-1 rounded-full bg-current" />
                </span>
                Explore
              </LocalizedClientLink>
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
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
