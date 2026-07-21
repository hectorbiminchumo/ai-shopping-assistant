import { useEffect, useRef, useState, RefObject } from "react"

// Kept in sync with the multer fileFilter allowlist in
// apps/backend/src/api/middlewares.ts — anything outside this set 400s
// server-side even if the browser reports it as an image.
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB
export const IMAGE_FORMAT_HINT = "JPG, PNG or WEBP · max 5MB"

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Only image files are supported."
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number]))
    return "Only JPG, PNG or WEBP images are supported."
  if (file.size > MAX_IMAGE_BYTES) return "Image must be smaller than 5MB."
  return null
}

/**
 * Drag & drop (over dropZoneRef's element) + click-to-browse trigger for
 * image search. Validation lives here so every entry point (drop,
 * click-to-browse, and VectraChat's paste handler) shares one rule set —
 * this component only forwards raw files via onFiles; the caller decides
 * what a valid/invalid file turns into (a chat bubble, in VectraChat).
 */
export default function ImageUpload({
  dropZoneRef,
  onFiles,
}: {
  dropZoneRef: RefObject<HTMLElement | null>
  onFiles: (files: FileList | File[]) => void
}) {
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  // Tracks nested dragenter/dragleave pairs so the overlay only hides once
  // the pointer truly leaves the zone, not on every child it crosses.
  const dragCounter = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = dropZoneRef.current
    if (!el) return

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
      dragCounter.current += 1
      setIsDraggingOver(true)
    }
    const onDragOver = (e: DragEvent) => {
      // preventDefault is what allows a drop here instead of the browser opening the file
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
      dragCounter.current = Math.max(0, dragCounter.current - 1)
      if (dragCounter.current === 0) setIsDraggingOver(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setIsDraggingOver(false)
      if (e.dataTransfer?.files.length) onFiles(e.dataTransfer.files)
    }

    el.addEventListener("dragenter", onDragEnter)
    el.addEventListener("dragover", onDragOver)
    el.addEventListener("dragleave", onDragLeave)
    el.addEventListener("drop", onDrop)
    return () => {
      el.removeEventListener("dragenter", onDragEnter)
      el.removeEventListener("dragover", onDragOver)
      el.removeEventListener("dragleave", onDragLeave)
      el.removeEventListener("drop", onDrop)
    }
  }, [dropZoneRef, onFiles])

  return (
    <>
      {isDraggingOver && (
        <div className="vectra-dropzone" aria-hidden="true">
          <div className="vectra-dropzone-inner">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              style={{ width: 30, height: 30 }}
            >
              <path d="M21 11.5l-8.5 8.5a5 5 0 01-7-7l9-9a3.3 3.3 0 014.7 4.7l-9 9a1.6 1.6 0 01-2.3-2.3l8.2-8.2" />
            </svg>
            <span>Drop image to search</span>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label="Attach image"
        title={`Attach image · ${IMAGE_FORMAT_HINT}`}
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
          ;(e.currentTarget as HTMLElement).style.background = "var(--surface-2)"
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLElement).style.color = "var(--text-muted)"
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
    </>
  )
}
