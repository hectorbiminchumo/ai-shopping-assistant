import type { CSSProperties } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function Banner() {
  return (
    <section
      aria-label="Promotional banner"
      className="relative overflow-hidden flex items-center"
      style={{ minHeight: "clamp(360px, 46vw, 560px)" }}
    >
      {/* Background — branded promo banner */}
      <div
        className="absolute inset-0 bg-image-set"
        style={
          {
            "--bg-webp": 'url("/banners/elevate.webp")',
            "--bg-fallback": 'url("/banners/elevate.png")',
            backgroundColor: "#08120c",
            backgroundSize: "cover",
            backgroundPosition: "center",
          } as CSSProperties
        }
        aria-hidden="true"
      />

      {/* Left shade */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.05) 70%)",
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        className="v-reveal relative z-10 max-w-[1280px] mx-auto w-full"
        style={{ paddingInline: "var(--pad)" }}
      >
        <h2
          className="font-bold leading-[.95] m-0 text-white"
          style={{
            fontSize: "clamp(40px, 6vw, 84px)",
            letterSpacing: "-0.035em",
          }}
        >
          Elevate your
          <br />
          performance
        </h2>
        <p
          className="text-white/90 font-normal m-0 mt-[18px] mb-[30px]"
          style={{ fontSize: "clamp(16px, 1.6vw, 21px)" }}
        >
          Discover the new seasonal collection.
        </p>
        <LocalizedClientLink
          href="/store"
          className="inline-flex items-center justify-center h-14 px-8 rounded-[16px] text-[15px] font-semibold tracking-tight transition-colors duration-200"
          style={{ background: "#fff", color: "#101010" }}
        >
          Shop the collection
        </LocalizedClientLink>
      </div>
    </section>
  )
}
