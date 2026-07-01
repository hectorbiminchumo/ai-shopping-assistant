import { Suspense } from "react"
import { listRegions } from "@lib/data/regions"
import { listCategories } from "@lib/data/categories"
import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import HeaderSearch from "@modules/layout/components/header-search"
import SideMenu from "@modules/layout/components/side-menu"
import NavLink from "@modules/layout/components/nav-link"

// Default Medusa starter categories — hidden from the storefront nav.
const JUNK_HANDLES = new Set(["shirts", "sweatshirts", "pants", "merch"])

// "running-shoes" → "Running Shoes"
const prettyName = (name: string) =>
  name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

export default async function Nav() {
  const [regions, localesRes, currentLocale] = await Promise.all([
    listRegions().catch(() => [] as StoreRegion[]),
    listLocales().catch(() => null),
    getLocale().catch(() => null),
  ])

  let categoryLinks: { label: string; href: string }[] = []
  try {
    const categories = await listCategories({ limit: 20 })
    categoryLinks = (categories ?? [])
      .filter((c) => !c.parent_category && !JUNK_HANDLES.has(c.handle))
      .slice(0, 4)
      .map((c) => ({ label: prettyName(c.name), href: `/categories/${c.handle}` }))
  } catch { /* nav still renders without category links */ }

  const navLinks = [{ label: "New Arrivals", href: "/store" }, ...categoryLinks]

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "saturate(1.1) blur(14px)",
        WebkitBackdropFilter: "saturate(1.1) blur(14px)",
        borderColor: "var(--line)",
        transition: "background .4s var(--ease)",
        position: "sticky",
      }}
    >
      <div
        className="flex items-center gap-9 h-[72px] max-w-[1280px] mx-auto"
        style={{ paddingInline: "var(--pad)" }}
      >
        {/* Mobile hamburger */}
        <div className="flex items-center small:hidden">
          <SideMenu
            regions={regions}
            locales={localesRes}
            currentLocale={currentLocale}
          />
        </div>
        {/* Brand */}
        <LocalizedClientLink
          href="/"
          className="flex items-center gap-2.5 font-bold text-xl tracking-[.06em] shrink-0"
          style={{ color: "var(--text)" }}
          aria-label="VECTRA, go to homepage"
        >
          <span
            className="w-[30px] h-[30px] rounded-lg grid place-items-center shrink-0"
            style={{ background: "var(--text)", color: "var(--bg)" }}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[18px] h-[18px]"
            >
              <path d="M5 6l6 6-6 6" />
              <path d="M12 6l6 6-6 6" />
            </svg>
          </span>
          VECTRA
        </LocalizedClientLink>

        {/* Main nav — desktop only */}
        <nav
          className="hidden small:flex items-center gap-[30px]"
          aria-label="Main navigation"
        >
          {navLinks.map(({ label, href }) => (
            <NavLink key={label} href={href} label={label} />
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Inline search */}
          <HeaderSearch />

          {/* Account — desktop */}
          <LocalizedClientLink
            href="/account"
            className="hidden small:grid w-[42px] h-[42px] place-items-center rounded-[16px] transition-colors duration-200 hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text)" }}
            aria-label="My account"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="w-[21px] h-[21px]"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0116 0" />
            </svg>
          </LocalizedClientLink>

          {/* Cart */}
          <Suspense
            fallback={
              <LocalizedClientLink
                href="/cart"
                className="grid w-[42px] h-[42px] place-items-center rounded-[16px] transition-colors duration-200 hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text)" }}
                aria-label="Cart"
                data-testid="nav-cart-link"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  className="w-[21px] h-[21px]"
                  aria-hidden="true"
                >
                  <path d="M6 7h13l-1.2 9.5a2 2 0 01-2 1.7H9.2a2 2 0 01-2-1.7L6 4H3" />
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="17" cy="21" r="1" />
                </svg>
              </LocalizedClientLink>
            }
          >
            <CartButton />
          </Suspense>
        </div>
      </div>
    </header>
  )
}
