"use client"

// Opens the global Ask Vectra assistant via the same custom event the
// chat island listens for (see vectra-chat: document "vectra:open").
export default function AskVectraButton() {
  return (
    <button
      type="button"
      onClick={() => document.dispatchEvent(new Event("vectra:open"))}
      className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-[16px] text-sm font-semibold tracking-tight transition-colors duration-200"
      style={{
        background: "var(--btn-sec-bg)",
        color: "var(--btn-sec-fg)",
      }}
    >
      <span
        className="w-[15px] h-[15px] rounded-full border-[1.5px] border-current grid place-items-center"
        aria-hidden="true"
      >
        <span className="w-1 h-1 rounded-full bg-current" />
      </span>
      Ask Vectra
    </button>
  )
}
