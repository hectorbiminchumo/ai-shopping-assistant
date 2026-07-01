import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import { Barlow, Barlow_Condensed } from "next/font/google"
import { Toaster } from "sonner"
import "styles/globals.css"

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
})

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-mode="light"
      data-scroll-behavior="smooth"
      className={`${barlow.variable} ${barlowCondensed.variable}`}
    >
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--text)] focus:text-[var(--bg)] focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--text)]"
        >
          Skip to main content
        </a>
        <main id="main-content" className="relative">{props.children}</main>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--bg)",
              color: "var(--text)",
              border: "1px solid var(--line)",
              borderRadius: "14px",
              fontFamily: "var(--font)",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  )
}
