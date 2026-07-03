import { listCategories } from "@lib/data/categories"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SUPPORT_LINKS = [
  { label: "Customer service", href: "/account" },
  { label: "Shipping", href: "/store" },
  { label: "Returns", href: "/store" },
  { label: "Size guide", href: "/store" },
]

const COMPANY_LINKS = [
  { label: "About VECTRA", href: "/store" },
  { label: "Contact", href: "/store" },
  { label: "Terms & conditions", href: "/store" },
  { label: "Privacy", href: "/store" },
]

function FootColHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="font-mono text-[13px] tracking-[.14em] uppercase m-0 mb-[18px] font-semibold"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </h3>
  )
}

function FootLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <LocalizedClientLink
        href={href}
        className="text-[14.5px] transition-colors duration-200 hover:opacity-60"
        style={{ color: "var(--text)" }}
      >
        {children}
      </LocalizedClientLink>
    </li>
  )
}

export default async function Footer() {
  const productCategories = await listCategories()

  const topCategories = productCategories
    ?.filter((c) => !c.parent_category)
    .slice(0, 5)

  return (
    <footer
      className="v-reveal"
      style={{
        background: "var(--bg)",
        borderTop: "1px solid var(--line)",
        paddingBlock: "64px 36px",
      }}
    >
      <div
        className="max-w-[1280px] mx-auto"
        style={{ paddingInline: "var(--pad)" }}
      >
        {/* Grid */}
        <div
          className="grid gap-10"
          style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
        >
          {/* Brand col */}
          <div>
            <LocalizedClientLink
              href="/"
              className="inline-flex items-center gap-2.5 font-bold text-xl tracking-[.06em] mb-4"
              style={{ color: "var(--text)" }}
              aria-label="VECTRA home"
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
            <p
              className="text-sm max-w-[260px]"
              style={{ color: "var(--text-muted)" }}
            >
              Essential sportswear. Clean design, honest materials.
            </p>

            {/* Social icons */}
            <div className="flex gap-2.5 mt-5">
              {[
                {
                  label: "Instagram",
                  svg: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                  ),
                },
                {
                  label: "X",
                  svg: (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" aria-hidden="true">
                      <path d="M18 3h3l-7 8 8 10h-6l-5-6-5 6H3l7-9L3 3h6l4 5z" />
                    </svg>
                  ),
                },
              ].map(({ label, svg }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-10 h-10 rounded-full border grid place-items-center transition-all duration-200 hover:border-current"
                  style={{
                    borderColor: "var(--line)",
                    color: "var(--text)",
                  }}
                >
                  {svg}
                </a>
              ))}
            </div>
          </div>

          {/* Categories col */}
          {topCategories && topCategories.length > 0 && (
            <div>
              <FootColHeading>Categories</FootColHeading>
              <ul className="flex flex-col gap-3" data-testid="footer-categories">
                {topCategories.map((c) => (
                  <FootLink key={c.id} href={`/categories/${c.handle}`}>
                    {c.name}
                  </FootLink>
                ))}
              </ul>
            </div>
          )}

          {/* Support col */}
          <div>
            <FootColHeading>Support</FootColHeading>
            <ul className="flex flex-col gap-3">
              {SUPPORT_LINKS.map(({ label, href }) => (
                <FootLink key={label} href={href}>
                  {label}
                </FootLink>
              ))}
            </ul>
          </div>

          {/* Company col */}
          <div>
            <FootColHeading>Company</FootColHeading>
            <ul className="flex flex-col gap-3">
              {COMPANY_LINKS.map(({ label, href }) => (
                <FootLink key={label} href={href}>
                  {label}
                </FootLink>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="flex items-center justify-between gap-5 flex-wrap mt-14 pt-[26px] text-[13px]"
          style={{
            borderTop: "1px solid var(--line)",
            color: "var(--text-muted)",
          }}
        >
          <span>© {new Date().getFullYear()} VECTRA. All rights reserved.</span>
          <span
            className="font-mono tracking-[.04em]"
            style={{ letterSpacing: ".04em" }}
          >
            Made with care · EN
          </span>
        </div>
      </div>
    </footer>
  )
}
