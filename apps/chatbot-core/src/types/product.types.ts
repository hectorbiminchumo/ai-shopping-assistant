export interface ProductVariant {
  id: string
  title: string
  sku: string
  price: number
  inventoryQuantity: number
  options: {
    size?: string
    color?: string
  }
}

export interface Product {
  id: string
  medusaProductId: string
  title: string
  description: string
  category?: string
  tags: string[]
  thumbnailUrl?: string
  variants: ProductVariant[]
}

export interface ProductCard {
  id: string
  title: string
  thumbnailUrl?: string
  priceMin: number
  priceMax: number
  similarityScore: number
}
