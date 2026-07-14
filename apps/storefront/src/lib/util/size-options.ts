import { HttpTypes } from "@medusajs/types"

const LETTER_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"]

// Distinct values of the "Size" product option across the given products:
// numeric sizes first (ascending), then letter sizes in garment order.
// Requires products fetched with the *options,*options.values fields.
export function collectSizeOptions(
  products: HttpTypes.StoreProduct[]
): string[] {
  const values = new Set<string>()
  for (const p of products) {
    const sizeOption = p.options?.find(
      (o) => o.title?.toLowerCase() === "size"
    )
    sizeOption?.values?.forEach((v) => {
      if (v.value) values.add(v.value)
    })
  }

  return Array.from(values).sort((a, b) => {
    const na = Number(a)
    const nb = Number(b)
    const aIsNum = !Number.isNaN(na)
    const bIsNum = !Number.isNaN(nb)
    if (aIsNum && bIsNum) return na - nb
    if (aIsNum) return -1
    if (bIsNum) return 1
    const ia = LETTER_ORDER.indexOf(a.toUpperCase())
    const ib = LETTER_ORDER.indexOf(b.toUpperCase())
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}
