"use client"

import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemPrice from "@modules/common/components/line-item-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import { usePathname } from "next/navigation"
import { Fragment, useEffect, useRef, useState } from "react"

const CartDropdown = ({
  cart: cartState,
}: {
  cart?: HttpTypes.StoreCart | null
}) => {
  const [activeTimer, setActiveTimer] = useState<NodeJS.Timer | undefined>(
    undefined
  )
  const [cartDropdownOpen, setCartDropdownOpen] = useState(false)

  const open = () => setCartDropdownOpen(true)
  const close = () => setCartDropdownOpen(false)

  const totalItems =
    cartState?.items?.reduce((acc, item) => {
      return acc + item.quantity
    }, 0) || 0

  const subtotal = cartState?.subtotal ?? 0
  const itemRef = useRef<number>(totalItems || 0)

  const timedOpen = () => {
    open()

    const timer = setTimeout(close, 5000)

    setActiveTimer(timer)
  }

  const openAndCancel = () => {
    if (activeTimer) {
      clearTimeout(activeTimer)
    }

    open()
  }

  // Clean up the timer when the component unmounts
  useEffect(() => {
    return () => {
      if (activeTimer) {
        clearTimeout(activeTimer)
      }
    }
  }, [activeTimer])

  const pathname = usePathname()

  // open cart dropdown when modifying the cart items, but only if we're not on the cart page
  useEffect(() => {
    if (itemRef.current !== totalItems && !pathname.includes("/cart")) {
      timedOpen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalItems, itemRef.current])

  return (
    <div
      className="h-full z-50"
      onMouseEnter={openAndCancel}
      onMouseLeave={close}
    >
      <Popover className="relative h-full">
        <PopoverButton className="h-full">
          <LocalizedClientLink
            href="/cart"
            className="relative grid w-[42px] h-[42px] place-items-center rounded-[16px] transition-colors duration-200 hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text)" }}
            aria-label={`Cart (${totalItems})`}
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
            <span
              className="absolute top-[2px] right-[2px] grid w-4 h-4 place-items-center rounded-full text-[10px] font-bold"
              style={{ background: "var(--text)", color: "var(--bg)" }}
              data-testid="nav-cart-count"
            >
              {totalItems}
            </span>
          </LocalizedClientLink>
        </PopoverButton>
        <Transition
          show={cartDropdownOpen}
          as={Fragment}
          enter="transition ease-out duration-200"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-1"
        >
          <PopoverPanel
            static
            className="hidden small:flex flex-col absolute top-[calc(100%+8px)] right-0 w-[400px] overflow-hidden"
            style={{
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 18,
              boxShadow: "var(--shadow-lg)",
              color: "var(--text)",
            }}
            data-testid="nav-cart-dropdown"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between"
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600 }}>Cart</span>
              <span
                className="font-mono uppercase"
                style={{
                  fontSize: 11,
                  letterSpacing: ".12em",
                  color: "var(--text-muted)",
                }}
              >
                {totalItems} {totalItems === 1 ? "item" : "items"}
              </span>
            </div>

            {cartState && cartState.items?.length ? (
              <>
                <div className="overflow-y-auto max-h-[400px] no-scrollbar flex flex-col">
                  {cartState.items
                    .sort((a, b) => {
                      return (a.created_at ?? "") > (b.created_at ?? "")
                        ? -1
                        : 1
                    })
                    .map((item) => (
                      <div
                        className="grid grid-cols-[80px_1fr] gap-x-4 items-start"
                        style={{
                          padding: "16px 20px",
                          borderBottom: "1px solid var(--line)",
                        }}
                        key={item.id}
                        data-testid="cart-item"
                      >
                        <LocalizedClientLink
                          href={`/products/${item.product_handle}`}
                          className="block rounded-[12px] overflow-hidden"
                          style={{ background: "var(--surface)" }}
                        >
                          <Thumbnail
                            thumbnail={item.thumbnail}
                            images={item.variant?.product?.images}
                            size="square"
                          />
                        </LocalizedClientLink>
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <h3
                              className="overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
                              style={{ fontSize: 14, fontWeight: 500 }}
                            >
                              <LocalizedClientLink
                                href={`/products/${item.product_handle}`}
                                data-testid="product-link"
                              >
                                {item.title}
                              </LocalizedClientLink>
                            </h3>
                            <div
                              className="shrink-0 text-right"
                              style={{ fontSize: 14, fontWeight: 600 }}
                            >
                              <LineItemPrice
                                item={item}
                                style="tight"
                                currencyCode={cartState.currency_code}
                              />
                            </div>
                          </div>
                          {item.variant?.title && (
                            <span
                              data-testid="cart-item-variant"
                              className="font-mono uppercase block overflow-hidden text-ellipsis whitespace-nowrap"
                              style={{
                                fontSize: 10,
                                letterSpacing: ".06em",
                                color: "var(--text-muted)",
                              }}
                            >
                              {item.variant.title}
                            </span>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            <span
                              data-testid="cart-item-quantity"
                              data-value={item.quantity}
                              style={{ fontSize: 12.5, color: "var(--text-muted)" }}
                            >
                              Qty: {item.quantity}
                            </span>
                            <DeleteButton
                              id={item.id}
                              data-testid="cart-item-remove-button"
                            >
                              Remove
                            </DeleteButton>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex flex-col gap-y-4" style={{ padding: 20 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      Subtotal{" "}
                      <span style={{ fontSize: 11.5 }}>(excl. taxes)</span>
                    </span>
                    <span
                      style={{ fontSize: 17, fontWeight: 700 }}
                      data-testid="cart-subtotal"
                      data-value={subtotal}
                    >
                      {convertToLocale({
                        amount: subtotal,
                        currency_code: cartState.currency_code,
                      })}
                    </span>
                  </div>
                  <LocalizedClientLink
                    href="/cart"
                    onClick={close}
                    data-testid="go-to-cart-button"
                    className="inline-flex items-center justify-center w-full h-12 rounded-[16px] text-sm font-semibold tracking-tight transition-colors duration-200"
                    style={{
                      background: "var(--btn-pri-bg)",
                      color: "var(--btn-pri-fg)",
                    }}
                  >
                    Go to cart
                  </LocalizedClientLink>
                </div>
              </>
            ) : (
              <div
                className="flex flex-col items-center justify-center text-center gap-3"
                style={{ padding: "48px 24px" }}
              >
                <div
                  className="grid place-items-center rounded-full"
                  style={{
                    width: 56,
                    height: 56,
                    background: "var(--surface-2)",
                    color: "var(--text-muted)",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    style={{ width: 24, height: 24 }}
                    aria-hidden="true"
                  >
                    <path d="M6 7h13l-1.2 9.5a2 2 0 01-2 1.7H9.2a2 2 0 01-2-1.7L6 4H3" />
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="17" cy="21" r="1" />
                  </svg>
                </div>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Your bag is empty</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Gear made for motion is waiting.
                </p>
                <LocalizedClientLink
                  href="/store"
                  onClick={close}
                  className="inline-flex items-center justify-center h-11 px-6 rounded-[16px] text-sm font-semibold tracking-tight transition-colors duration-200 mt-1"
                  style={{
                    background: "var(--btn-pri-bg)",
                    color: "var(--btn-pri-fg)",
                  }}
                >
                  Explore products
                </LocalizedClientLink>
              </div>
            )}
          </PopoverPanel>
        </Transition>
      </Popover>
    </div>
  )
}

export default CartDropdown
