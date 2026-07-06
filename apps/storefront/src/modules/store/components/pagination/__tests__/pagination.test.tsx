import { render, screen, fireEvent } from "@testing-library/react"
import { Pagination } from "../index"

const push = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/us/search",
  useSearchParams: () => new URLSearchParams("q=shoes"),
}))

describe("Pagination", () => {
  beforeEach(() => {
    push.mockClear()
  })

  it("renders every page button when there are 7 pages or fewer", () => {
    render(<Pagination page={1} totalPages={5} />)

    for (let p = 1; p <= 5; p++) {
      expect(screen.getByRole("button", { name: `Go to page ${p}` })).toBeInTheDocument()
    }
    expect(screen.queryByText("…")).not.toBeInTheDocument()
  })

  it("marks the current page and disables its button", () => {
    render(<Pagination page={3} totalPages={5} />)

    const current = screen.getByRole("button", { name: "Go to page 3" })
    expect(current).toHaveAttribute("aria-current", "page")
    expect(current).toBeDisabled()
  })

  it("disables prev on the first page and next on the last page", () => {
    const { rerender } = render(<Pagination page={1} totalPages={5} />)
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled()

    rerender(<Pagination page={5} totalPages={5} />)
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  })

  it("navigates to the clicked page preserving existing query params", () => {
    render(<Pagination page={1} totalPages={5} />)

    fireEvent.click(screen.getByRole("button", { name: "Go to page 3" }))

    expect(push).toHaveBeenCalledWith("/us/search?q=shoes&page=3", {
      scroll: true,
    })
  })

  it("truncates with ellipses around the current page when there are many pages", () => {
    render(<Pagination page={10} totalPages={20} />)

    // 1 … 9 10 11 … 20
    for (const p of [1, 9, 10, 11, 20]) {
      expect(screen.getByRole("button", { name: `Go to page ${p}` })).toBeInTheDocument()
    }
    expect(screen.getAllByText("…")).toHaveLength(2)
    expect(
      screen.queryByRole("button", { name: "Go to page 5" })
    ).not.toBeInTheDocument()
  })
})
