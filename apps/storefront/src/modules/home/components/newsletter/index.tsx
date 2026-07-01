"use client"

import { useState, FormEvent, type CSSProperties } from "react"

export default function Newsletter() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  return (
    <section
      aria-labelledby="newsletter-heading"
      className="relative overflow-hidden grid place-items-center text-center"
      style={{ minHeight: 420 }}
    >
      {/* Background */}
      <div
        className="absolute inset-0 bg-image-set"
        style={
          {
            "--bg-webp": 'url("/banners/newsletter.webp")',
            "--bg-fallback": 'url("/banners/newsletter.jpeg")',
            backgroundColor: "#0a0a09",
            backgroundSize: "cover",
            backgroundPosition: "center",
          } as CSSProperties
        }
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "rgba(0,0,0,.45)" }}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        className="v-reveal relative z-10 text-white w-full max-w-[620px]"
        style={{ paddingInline: 24 }}
      >
        <h2
          id="newsletter-heading"
          className="font-bold m-0 mb-2.5 text-white"
          style={{
            fontSize: "clamp(34px, 5vw, 60px)",
            letterSpacing: "-0.03em",
          }}
        >
          Newsletter
        </h2>
        <p className="text-white/90 m-0" style={{ fontSize: 17 }}>
          News, drops and 10% off your first order.
        </p>

        {submitted ? (
          <p
            className="mt-7 font-mono text-sm tracking-wide"
            style={{ color: "var(--accent)" }}
            role="status"
          >
            ✓ You&apos;re in. Welcome to VECTRA.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex mt-7 items-center gap-2"
            style={{
              background: "rgba(255,255,255,.12)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,.3)",
              borderRadius: 999,
              padding: "8px 8px 8px 22px",
            }}
            noValidate
          >
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              required
              autoComplete="email"
              className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/65"
              style={{ fontSize: 15, minWidth: 0 }}
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center h-10 px-6 rounded-full text-sm font-semibold tracking-tight transition-colors duration-200 shrink-0"
              style={{ background: "#fff", color: "#101010" }}
            >
              Subscribe
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
