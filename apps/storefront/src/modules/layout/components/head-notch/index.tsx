"use client"

export default function HeadNotch() {
  const openChat = () => {
    document.dispatchEvent(new CustomEvent("vectra:open"))
  }

  return (
    <>
      <style>{`
        @keyframes notchHint {
          0%, 72%, 100% { transform: translateY(0); }
          82% { transform: translateY(3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .head-notch-svg { animation: none !important; }
        }
      `}</style>
      <button
        onClick={openChat}
        aria-label="Open search assistant"
        style={{
          position: "absolute",
          bottom: -18,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 18,
          borderRadius: "0 0 999px 999px",
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderTop: "none",
          cursor: "pointer",
          zIndex: 10,
          color: "var(--text-muted)",
          transition: "color .2s, background .2s",
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLElement).style.background = "var(--text)"
          ;(e.currentTarget as HTMLElement).style.color = "var(--bg)"
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLElement).style.background = "var(--surface-2)"
          ;(e.currentTarget as HTMLElement).style.color = "var(--text-muted)"
        }}
      >
        <svg
          className="head-notch-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          style={{
            width: 14,
            height: 14,
            display: "block",
            animation: "notchHint 2.6s cubic-bezier(.22,.61,.36,1) infinite",
          }}
          aria-hidden="true"
        >
          <path d="M7 10l5 5 5-5" />
        </svg>
      </button>
    </>
  )
}
