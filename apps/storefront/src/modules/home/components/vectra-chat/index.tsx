"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { search, SemanticProduct } from "@lib/api"
import ProductCard from "@modules/products/components/product-card"

type Message =
  | { role: "bot"; text: string; products?: HttpTypes.StoreProduct[] }
  | { role: "user"; text: string; images?: string[] }
  | { role: "typing" }

const SUGGESTS = [
  { label: "Long-distance running", query: "Shoes for long-distance running" },
  { label: "Waterproof outdoor", query: "Something waterproof for the mountains" },
  { label: "Lightweight training", query: "Lightweight training gear" },
  { label: "Everyday lifestyle", query: "A jacket for everyday wear" },
]

// The backend returns embedding-index products; join them against the
// catalog the loader fetched to recover the full Medusa product (handle,
// prices, badges). Results missing from the storefront catalog (e.g.
// unpublished products still in the index) can't be linked or purchased,
// so they are dropped.
function toCatalogProducts(
  results: SemanticProduct[],
  catalog: HttpTypes.StoreProduct[]
): HttpTypes.StoreProduct[] {
  return results.flatMap((r) => {
    const known = catalog.find((p) => p.id === r.medusaProductId)
    return known ? [known] : []
  })
}

function TypingDots() {
  return (
    <div className="flex gap-[5px] items-center pt-2">
      {[0, 0.2, 0.4].map((delay, i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--text-muted)",
            display: "inline-block",
            animation: `vectra-blink 1.2s ${delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// Same card as the category/store grids (ProductCard in compact mode),
// sized to fit three-up inside the chat thread.
function ChatProductCard({ p }: { p: HttpTypes.StoreProduct }) {
  return (
    <div style={{ flex: "0 0 calc((100% - 28px) / 3)", minWidth: 140 }}>
      <ProductCard product={p} compact />
    </div>
  )
}

export default function VectraChat({
  products,
}: {
  products: HttpTypes.StoreProduct[]
}) {
  const [open, setOpen] = useState(false)
  // Docked-widget mode: the panel shrinks to a corner window so the page
  // behind stays visible (e.g. after navigating to a product from the chat)
  const [mini, setMini] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "Hi! I'm Vectra, your shopping assistant. Tell me what you're after (like \"trail running shoes\" or \"something lightweight for summer runs\") and I'll find the closest match.",
    },
  ])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [attachImages, setAttachImages] = useState<string[]>([])
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const floatRef = useRef<HTMLButtonElement>(null)
  const prevOpen = useRef(false)
  const pathname = usePathname()
  const prevPathname = useRef(pathname)

  const scrollToBottom = useCallback(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (open) {
      setTimeout(() => taRef.current?.focus(), 420)
    } else if (prevOpen.current) {
      // Return focus to the trigger when the dialog closes; the composer
      // text is kept so the user can pick up where they left off.
      floatRef.current?.focus()
    }
    prevOpen.current = open
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape only dismisses the full-screen (modal) mode — the docked
      // widget doesn't capture the page's keyboard
      if (e.key === "Escape" && open && !mini) setOpen(false)
    }
    const onOpen = () => {
      setMini(false)
      setOpen(true)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("vectra:open", onOpen)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("vectra:open", onOpen)
    }
  }, [open, mini])

  // Navigating away from inside the chat (product card, quick-add) would
  // otherwise leave the full-screen panel covering the new page: dock the
  // chat to a corner widget instead (close it on mobile, where the docked
  // window doesn't fit). The conversation is kept either way.
  useEffect(() => {
    if (prevPathname.current === pathname) return
    prevPathname.current = pathname
    if (!open) return
    if (window.matchMedia("(max-width: 767px)").matches) {
      setOpen(false)
    } else {
      setMini(true)
    }
  }, [pathname, open])

  const autosize = () => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px"
  }

  const addFiles = (files: FileList | File[]) => {
    Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .forEach((f) => {
        const r = new FileReader()
        r.onload = (ev) => {
          if (ev.target?.result)
            setAttachImages((prev) => [...prev, ev.target!.result as string])
        }
        r.readAsDataURL(f)
      })
  }

  const send = async (overrideText?: string) => {
    if (busy) return
    const q = (overrideText ?? input).trim()
    if (!q && !attachImages.length) return

    const userMsg: Message = {
      role: "user",
      text: q,
      images: attachImages.length ? [...attachImages] : undefined,
    }
    setMessages((prev) => [...prev, userMsg, { role: "typing" }])
    setInput("")
    setAttachImages([])
    if (taRef.current) taRef.current.style.height = "auto"
    setBusy(true)

    try {
      let botMsg: Message
      if (!q) {
        // Image-only message — image search isn't wired to the backend yet
        botMsg = {
          role: "bot",
          text: "Image search isn't available just yet — try describing what you're looking for in words and I'll find the closest match.",
        }
      } else {
        const result = await search(q)
        const picks = toCatalogProducts(result.products, products)
        botMsg =
          result.hasResults && picks.length
            ? {
                role: "bot",
                text: `I found ${picks.length} product${picks.length > 1 ? "s" : ""} that match your search:`,
                products: picks,
              }
            : {
                role: "bot",
                text: "I couldn't find a close match in our catalog. Try describing it differently — the activity, conditions or product type all help.",
              }
      }
      setMessages((prev) => [...prev.filter((m) => m.role !== "typing"), botMsg])
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => m.role !== "typing"),
        {
          role: "bot",
          text: "Something went wrong on my end. Please try again.",
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items ?? []).filter((i) =>
      i.type.startsWith("image/")
    )
    if (items.length) {
      e.preventDefault()
      addFiles(items.map((i) => i.getAsFile()!))
    }
  }

  return (
    <>
      {/* ============ KEYFRAME STYLE ============ */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .vectra-panel-scrim{transition:opacity .45s cubic-bezier(.22,.61,.36,1)}
          .vectra-panel{transition:transform .5s cubic-bezier(.22,.61,.36,1)}
          .vectra-float{transition:transform .25s cubic-bezier(.22,.61,.36,1),opacity .3s,background .25s}
          .vectra-float.hidden{transform:translateY(20px)}
        }
        .vectra-panel-scrim{position:fixed;inset:0;z-index:61;background:var(--overlay);opacity:0;pointer-events:none}
        .vectra-panel-scrim.open{opacity:1;pointer-events:auto}
        .vectra-panel{position:fixed;left:0;right:0;bottom:0;z-index:62;background:var(--bg);border-top:1px solid var(--line);box-shadow:0 -8px 40px rgba(0,0,0,.12);transform:translateY(100%);display:flex;flex-direction:column;height:100vh;height:100dvh}
        .vectra-panel.open{transform:translateY(0)}
        .vectra-panel.mini{--pad:16px;left:auto;top:auto;right:24px;bottom:24px;width:min(400px,calc(100vw - 48px));height:min(560px,calc(100dvh - 48px));border:1px solid var(--line);border-radius:20px;box-shadow:0 16px 56px rgba(0,0,0,.2);overflow:hidden}
        .vectra-panel.mini .vectra-grip{display:none}
        .vectra-float{position:fixed;right:28px;bottom:28px;z-index:55;display:inline-flex;align-items:center;gap:10px;height:52px;padding:0 24px;border-radius:999px;background:var(--btn-pri-bg);color:var(--btn-pri-fg);font-size:14px;font-weight:600;letter-spacing:-0.01em;font-family:inherit;box-shadow:0 4px 20px rgba(0,0,0,.15);border:none;cursor:pointer}
        .vectra-float:hover{background:var(--btn-pri-bg-h)}
        .vectra-float:active{transform:translateY(1px)}
        .vectra-float.hidden{opacity:0;pointer-events:none}
        .composer-inner{border:1px solid var(--line-strong);border-radius:20px;background:var(--surface);padding:12px 12px 12px 18px;display:flex;flex-direction:column;gap:10px;transition:border-color .2s}
        .composer-inner:focus-within{border-color:var(--text)}
      `}</style>

      {/* ============ SCRIM (full-screen mode only) ============ */}
      <div
        className={`vectra-panel-scrim${open && !mini ? " open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* ============ CHAT PANEL ============ */}
      <aside
        className={`vectra-panel${open ? " open" : ""}${mini ? " mini" : ""}`}
        role="dialog"
        aria-modal={!mini}
        aria-label="Vectra search assistant"
        aria-hidden={!open}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "22px var(--pad)",
            borderBottom: "1px solid var(--line)",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontFamily: "var(--mono)",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            <strong style={{ color: "var(--text)", fontWeight: 600 }}>Vectra</strong>
            {" · search with text or images"}
          </div>
          <button
            onClick={() => setMini((m) => !m)}
            aria-label={mini ? "Maximize chat" : "Minimize chat"}
            style={{
              marginLeft: "auto",
              width: 44,
              height: 44,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              color: "var(--text)",
              background: "none",
              border: "none",
              cursor: "pointer",
              transition: "background .15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--surface-2)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "none")
            }
          >
            {mini ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                style={{ width: 19, height: 19 }}
              >
                <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                style={{ width: 19, height: 19 }}
              >
                <path d="M5 12h14" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              color: "var(--text)",
              background: "none",
              border: "none",
              cursor: "pointer",
              transition: "background .15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--surface-2)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "none")
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              style={{ width: 21, height: 21 }}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {/* Grip indicator */}
          <div
            className="vectra-grip"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 8,
              transform: "translateX(-50%)",
              width: 46,
              height: 4,
              borderRadius: 999,
              background: "var(--line-strong)",
            }}
          />
        </div>

        {/* Chat thread */}
        <div
          ref={chatScrollRef}
          style={{ flex: 1, overflowY: "auto", padding: "30px var(--pad) 12px" }}
        >
          <div
            aria-live="polite"
            style={{
              maxWidth: 860,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 22,
            }}
          >
            {messages.map((msg, i) => {
              if (msg.role === "typing") {
                return (
                  <div key={i} style={{ display: "flex", gap: 14 }}>
                    <div
                      style={{
                        flexShrink: 0,
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "var(--text)",
                        color: "var(--bg)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: "var(--mono)",
                      }}
                    >
                      V
                    </div>
                    <div style={{ fontSize: 15, lineHeight: 1.6, paddingTop: 4 }}>
                      <span className="sr-only">Vectra is typing</span>
                      <TypingDots />
                    </div>
                  </div>
                )
              }

              if (msg.role === "user") {
                return (
                  <div
                    key={i}
                    style={{ display: "flex", gap: 14, flexDirection: "row-reverse" }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "var(--surface-2)",
                        color: "var(--text)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "var(--mono)",
                      }}
                    >
                      YOU
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        lineHeight: 1.6,
                        paddingTop: 4,
                        textAlign: "right",
                      }}
                    >
                      {msg.images?.map((src, j) => (
                        <img
                          key={j}
                          src={src}
                          alt=""
                          style={{
                            width: 80,
                            height: 80,
                            objectFit: "cover",
                            borderRadius: 12,
                            border: "1px solid var(--line)",
                            marginBottom: 8,
                          }}
                        />
                      ))}
                      {msg.text && <div>{msg.text}</div>}
                    </div>
                  </div>
                )
              }

              // bot message
              return (
                <div key={i} style={{ display: "flex", gap: 14 }}>
                  <div
                    style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "var(--text)",
                      color: "var(--bg)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "var(--mono)",
                    }}
                  >
                    V
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.6, paddingTop: 4, flex: 1 }}>
                    <div>{msg.text}</div>
                    {msg.products && msg.products.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: 14,
                          flexWrap: "wrap",
                          marginTop: 14,
                        }}
                      >
                        {msg.products.map((p) => (
                          <ChatProductCard key={p.id} p={p} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Suggestion chips (only before first user message) */}
          {messages.filter((m) => m.role === "user").length === 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                maxWidth: 860,
                margin: "14px auto 0",
              }}
            >
              {SUGGESTS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => send(s.query)}
                  disabled={busy}
                  style={{
                    fontSize: 13,
                    padding: "8px 14px",
                    borderRadius: 16,
                    border: "1px solid var(--line)",
                    color: "var(--text-muted)",
                    background: "none",
                    cursor: "pointer",
                    transition: "all .2s",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.borderColor =
                      "var(--text)"
                    ;(e.currentTarget as HTMLElement).style.color = "var(--text)"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.borderColor =
                      "var(--line)"
                    ;(e.currentTarget as HTMLElement).style.color =
                      "var(--text-muted)"
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            borderTop: "1px solid var(--line)",
            padding: "18px var(--pad)",
            flexShrink: 0,
          }}
        >
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <div className="composer-inner">
              {/* Image thumbnails */}
              {attachImages.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {attachImages.map((src, i) => (
                    <div
                      key={i}
                      style={{
                        position: "relative",
                        width: 54,
                        height: 54,
                        borderRadius: 10,
                        overflow: "hidden",
                        border: "1px solid var(--line)",
                      }}
                    >
                      <img
                        src={src}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <button
                        onClick={() =>
                          setAttachImages((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label="Remove image"
                        style={{
                          position: "absolute",
                          top: -10,
                          right: -10,
                          width: 44,
                          height: 44,
                          display: "grid",
                          placeItems: "center",
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: "rgba(0,0,0,.6)",
                            color: "#fff",
                            fontSize: 11,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          ×
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <textarea
                  ref={taRef}
                  rows={1}
                  placeholder="Describe what you're looking for…"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    autosize()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  onPaste={onPaste}
                  style={{
                    flex: 1,
                    border: "none",
                    background: "none",
                    resize: "none",
                    color: "var(--text)",
                    fontSize: 16,
                    lineHeight: 1.5,
                    maxHeight: 120,
                    padding: "0",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files)
                    e.target.value = ""
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="Attach image"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--text-muted)",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    transition: "color .2s, background .2s",
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.color = "var(--text)"
                    ;(e.currentTarget as HTMLElement).style.background =
                      "var(--surface-2)"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.color =
                      "var(--text-muted)"
                    ;(e.currentTarget as HTMLElement).style.background = "none"
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    style={{ width: 21, height: 21 }}
                  >
                    <path d="M21 11.5l-8.5 8.5a5 5 0 01-7-7l9-9a3.3 3.3 0 014.7 4.7l-9 9a1.6 1.6 0 01-2.3-2.3l8.2-8.2" />
                  </svg>
                </button>
                <button
                  onClick={() => send()}
                  disabled={busy}
                  aria-label="Send"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    flexShrink: 0,
                    background: "var(--btn-pri-bg)",
                    color: "var(--btn-pri-fg)",
                    display: "grid",
                    placeItems: "center",
                    border: "none",
                    cursor: busy ? "default" : "pointer",
                    opacity: busy ? 0.5 : 1,
                    transition: "background .2s, opacity .2s",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    style={{ width: 21, height: 21 }}
                  >
                    <path d="M5 12h13M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                letterSpacing: ".04em",
                color: "var(--text-muted)",
                paddingLeft: 4,
                marginTop: 8,
              }}
            >
              Paste or attach images · Enter to send · Esc to close
            </div>
          </div>
        </div>
      </aside>

      {/* ============ FLOATING BUTTON ============ */}
      <button
        ref={floatRef}
        className={`vectra-float${open ? " hidden" : ""}`}
        onClick={() => {
          setMini(false)
          setOpen(true)
        }}
        aria-label="Ask Vectra"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 20, height: 20, flexShrink: 0 }}
        >
          <path d="M12 6V2H8" />
          <path d="M15 11v2" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
          <path d="M9 11v2" />
        </svg>
        <span>Ask Vectra</span>
      </button>
    </>
  )
}
