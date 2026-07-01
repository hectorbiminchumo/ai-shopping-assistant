"use client"

import { clx } from "@modules/common/components/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { type ReactNode } from "react"

export function Pagination({
  page,
  totalPages,
  "data-testid": dataTestid,
}: {
  page: number
  totalPages: number
  "data-testid"?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Helper function to generate an array of numbers within a range
  const arrayRange = (start: number, stop: number) =>
    Array.from({ length: stop - start + 1 }, (_, index) => start + index)

  // Function to handle page changes
  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === page) {
      return
    }
    const params = new URLSearchParams(searchParams)
    params.set("page", newPage.toString())
    router.push(`${pathname}?${params.toString()}`, { scroll: true })
  }

  // Function to render a page button
  const renderPageButton = (p: number) => {
    const isCurrent = p === page
    return (
      <button
        key={p}
        type="button"
        aria-label={`Go to page ${p}`}
        aria-current={isCurrent ? "page" : undefined}
        disabled={isCurrent}
        onClick={() => goToPage(p)}
        className={clx(
          "txt-large flex h-10 w-10 items-center justify-center rounded-full transition-colors",
          "text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-subtle",
          {
            "bg-ui-fg-base text-ui-bg-base font-semibold hover:text-ui-bg-base hover:bg-ui-fg-base":
              isCurrent,
          }
        )}
      >
        {p}
      </button>
    )
  }

  // Function to render ellipsis
  const renderEllipsis = (key: string) => (
    <span
      key={key}
      className="txt-large flex h-10 w-6 select-none items-center justify-center text-ui-fg-muted"
    >
      …
    </span>
  )

  // Function to render an arrow (prev / next) button
  const renderArrow = (direction: "prev" | "next") => {
    const isPrev = direction === "prev"
    const disabled = isPrev ? page <= 1 : page >= totalPages
    return (
      <button
        type="button"
        aria-label={isPrev ? "Previous page" : "Next page"}
        disabled={disabled}
        onClick={() => goToPage(isPrev ? page - 1 : page + 1)}
        className={clx(
          "flex h-10 w-10 items-center justify-center rounded-full text-ui-fg-base transition-colors",
          "hover:bg-ui-bg-subtle disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        )}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isPrev ? "" : "rotate-180"}
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    )
  }

  // Function to render page buttons based on the current page and total pages
  const renderPageButtons = () => {
    const buttons: ReactNode[] = []

    if (totalPages <= 7) {
      // Show all pages
      buttons.push(...arrayRange(1, totalPages).map(renderPageButton))
    } else if (page <= 4) {
      // Show 1, 2, 3, 4, 5, ..., lastpage
      buttons.push(...arrayRange(1, 5).map(renderPageButton))
      buttons.push(renderEllipsis("ellipsis1"))
      buttons.push(renderPageButton(totalPages))
    } else if (page >= totalPages - 3) {
      // Show 1, ..., lastpage - 4 ... lastpage
      buttons.push(renderPageButton(1))
      buttons.push(renderEllipsis("ellipsis2"))
      buttons.push(...arrayRange(totalPages - 4, totalPages).map(renderPageButton))
    } else {
      // Show 1, ..., page - 1, page, page + 1, ..., lastpage
      buttons.push(renderPageButton(1))
      buttons.push(renderEllipsis("ellipsis3"))
      buttons.push(...arrayRange(page - 1, page + 1).map(renderPageButton))
      buttons.push(renderEllipsis("ellipsis4"))
      buttons.push(renderPageButton(totalPages))
    }

    return buttons
  }

  // Render the component
  return (
    <nav aria-label="Pagination" className="flex w-full justify-center mt-12">
      <div className="flex items-center gap-1" data-testid={dataTestid}>
        {renderArrow("prev")}
        {renderPageButtons()}
        {renderArrow("next")}
      </div>
    </nav>
  )
}
