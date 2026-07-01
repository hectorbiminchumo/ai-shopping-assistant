import { render, screen } from "@testing-library/react"
import type { HttpTypes } from "@medusajs/types"
import ProductCard from "../index"
import { getProductPrice } from "@lib/util/get-product-price"

// Heavy/IO dependencies are mocked so the test focuses on ProductCard's own rendering.
jest.mock("@lib/util/get-product-price", () => ({
  getProductPrice: jest.fn(),
}))

jest.mock("../quick-add", () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock("@modules/common/components/localized-client-link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const mockedGetProductPrice = getProductPrice as jest.MockedFunction<
  typeof getProductPrice
>

function makeProduct(
  overrides: Partial<HttpTypes.StoreProduct> = {}
): HttpTypes.StoreProduct {
  return {
    id: "prod_1",
    title: "Trail Runner GTX",
    handle: "trail-runner-gtx",
    thumbnail: "https://example.com/shoe.jpg",
    created_at: "2000-01-01T00:00:00.000Z",
    collection: { id: "col_1", title: "Trail" },
    categories: [],
    variants: [{ id: "var_1" }],
    ...overrides,
  } as unknown as HttpTypes.StoreProduct
}

describe("ProductCard", () => {
  beforeEach(() => {
    mockedGetProductPrice.mockReset()
  })

  it("renders the product title, brand and link to the PDP", () => {
    mockedGetProductPrice.mockReturnValue({
      cheapestPrice: {
        price_type: "default",
        calculated_price: "$120",
        original_price: "$120",
        percentage_diff: "0",
      },
    } as ReturnType<typeof getProductPrice>)

    render(<ProductCard product={makeProduct()} />)

    expect(screen.getByTestId("product-title")).toHaveTextContent(
      "Trail Runner GTX"
    )
    expect(screen.getByText("Trail")).toBeInTheDocument()
    expect(screen.getByText("$120")).toBeInTheDocument()
    expect(screen.getByTestId("product-wrapper")).toHaveAttribute(
      "href",
      "/products/trail-runner-gtx"
    )
  })

  it("shows the sale price, struck-through original and discount badge on sale", () => {
    mockedGetProductPrice.mockReturnValue({
      cheapestPrice: {
        price_type: "sale",
        calculated_price: "$80",
        original_price: "$100",
        percentage_diff: "20",
      },
    } as ReturnType<typeof getProductPrice>)

    render(<ProductCard product={makeProduct()} />)

    expect(screen.getByTestId("price")).toHaveTextContent("$80")
    expect(screen.getByTestId("original-price")).toHaveTextContent("$100")
    expect(screen.getByText("−20%")).toBeInTheDocument()
  })

  it("flags recently created products with a New badge", () => {
    mockedGetProductPrice.mockReturnValue({
      cheapestPrice: {
        price_type: "default",
        calculated_price: "$120",
        original_price: "$120",
        percentage_diff: "0",
      },
    } as ReturnType<typeof getProductPrice>)

    render(
      <ProductCard product={makeProduct({ created_at: new Date().toISOString() })} />
    )

    expect(screen.getByText("New")).toBeInTheDocument()
  })
})
