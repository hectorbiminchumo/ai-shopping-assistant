"use client"

import { useEffect } from "react"

/**
 * Global engine for the .v-reveal utility (see globals.css motion layer).
 *
 * Fades/slides each .v-reveal element in the FIRST time it enters the
 * viewport: an IntersectionObserver adds .v-in and unobserves, so the
 * reveal never re-runs. Mounted once from the (main) layout.
 *
 * The hidden initial state is gated on <html>.v-motion, which is only
 * set here — without JS (or with reduced motion) nothing is hidden.
 */
export default function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    document.documentElement.classList.add("v-motion")

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("v-in")
            io.unobserve(entry.target)
          }
        }
      },
      // Trigger slightly before the element is 10% into the viewport
      { rootMargin: "0px 0px -10% 0px" }
    )

    const observeWithin = (root: Element | Document) => {
      root.querySelectorAll(".v-reveal:not(.v-in)").forEach((el) => io.observe(el))
    }
    observeWithin(document)

    // App Router navigations swap page DOM without remounting this
    // component — watch for new .v-reveal elements as they stream in.
    const mo = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.matches(".v-reveal")) io.observe(node)
          observeWithin(node)
        })
      }
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      io.disconnect()
      document.documentElement.classList.remove("v-motion")
    }
  }, [])

  return null
}
