"use client"

import { usePathname, useParams } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type NavLinkProps = {
  href: string
  label: string
}

export default function NavLink({ href, label }: NavLinkProps) {
  const pathname = usePathname()
  const { countryCode } = useParams() as { countryCode: string }

  const pathWithoutLocale = pathname.replace(`/${countryCode}`, "") || "/"
  const active =
    href === "/"
      ? pathWithoutLocale === "/"
      : pathWithoutLocale.startsWith(href)

  return (
    <LocalizedClientLink
      href={href}
      className="relative text-sm font-medium py-1.5 transition-colors duration-200
                 after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:bg-current
                 after:transition-all after:duration-200
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--text)] rounded-sm"
      style={{
        color: active ? "var(--text)" : "var(--text-muted)",
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
      <span
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: active ? "100%" : 0,
          height: 1.5,
          background: "currentColor",
          transition: "width .2s var(--ease)",
        }}
      />
    </LocalizedClientLink>
  )
}
