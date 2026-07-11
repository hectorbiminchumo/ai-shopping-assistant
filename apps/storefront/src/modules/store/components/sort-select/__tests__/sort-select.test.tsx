import { render, screen, fireEvent } from "@testing-library/react"
import SortSelect from "../index"

const push = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/us/search",
  useSearchParams: () => new URLSearchParams("q=shoes"),
}))

describe("SortSelect", () => {
  beforeEach(() => {
    push.mockClear()
  })

  it("renders the sort options with the current one selected", () => {
    render(<SortSelect sortBy="price_asc" />)

    const button = screen.getByRole("button", { name: "Sort products" })
    expect(button).toHaveTextContent("Price: low to high")

    fireEvent.click(button)
    expect(screen.getByRole("option", { name: "Latest arrivals" })).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Price: low to high" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Price: high to low" })
    ).toBeInTheDocument()
  })

  it("updates the sortBy query param preserving existing ones", () => {
    render(<SortSelect sortBy="created_at" />)

    fireEvent.click(screen.getByRole("button", { name: "Sort products" }))
    fireEvent.click(screen.getByRole("option", { name: "Price: high to low" }))

    expect(push).toHaveBeenCalledWith("/us/search?q=shoes&sortBy=price_desc")
  })
})
