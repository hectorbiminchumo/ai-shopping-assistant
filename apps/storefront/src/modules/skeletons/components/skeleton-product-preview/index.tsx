// Loading skeleton matching the VECTRA ProductCard footprint
// (framed tile + 1/1 image + eyebrow/title/price lines).
const SkeletonProductPreview = () => {
  return (
    <div className="vectra-pc animate-pulse" role="status" aria-label="Loading product">
      {/* Image tile */}
      <div
        className="w-full rounded-[14px]"
        style={{ aspectRatio: "1 / 1", background: "var(--surface-2)" }}
      />

      {/* Info */}
      <div style={{ paddingTop: 18 }}>
        {/* Brand eyebrow */}
        <div
          className="rounded"
          style={{
            width: "40%",
            height: 9,
            background: "var(--line-strong)",
            marginBottom: 12,
          }}
        />
        {/* Title + price row */}
        <div className="flex items-center justify-between gap-4">
          <div
            className="rounded"
            style={{ width: "55%", height: 13, background: "var(--line-strong)" }}
          />
          <div
            className="rounded"
            style={{ width: 46, height: 13, background: "var(--line-strong)" }}
          />
        </div>
      </div>
    </div>
  )
}

export default SkeletonProductPreview
