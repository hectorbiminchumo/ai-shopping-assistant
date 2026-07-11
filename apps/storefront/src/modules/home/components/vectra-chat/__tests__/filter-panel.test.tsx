import { render, screen, fireEvent } from "@testing-library/react"
import FilterPanel from "../filter-panel"

// The panel is a controlled component: it never talks to the API itself,
// it only reports changes to the parent via onChange. The full flow
// (tags, clear-all, sending filters with the next message) is covered in
// vectra-chat.test.tsx. Category/size are Headless UI listboxes: options
// render only while the dropdown is open.
describe("FilterPanel", () => {
  const categories = ["jackets", "running-shoes"]
  const sizes = ["40", "41", "M"]

  const pickOption = (testId: string, name: string) => {
    fireEvent.click(screen.getByTestId(testId))
    fireEvent.click(screen.getByRole("option", { name }))
  }

  it("renders all filter inputs and lists options when a dropdown opens", () => {
    render(
      <FilterPanel
        filters={{}}
        categories={categories}
        sizes={sizes}
        onChange={jest.fn()}
      />
    )

    expect(screen.getByTestId("chat-filter-price-min")).toBeInTheDocument()
    expect(screen.getByTestId("chat-filter-price-max")).toBeInTheDocument()
    expect(screen.getByTestId("chat-filter-category")).toBeInTheDocument()
    expect(screen.getByTestId("chat-filter-size")).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("chat-filter-category"))
    expect(screen.getByRole("option", { name: "All categories" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "jackets" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "running-shoes" })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("chat-filter-size"))
    expect(screen.getByRole("option", { name: "Any size" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "40" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "M" })).toBeInTheDocument()
  })

  it("shows the current filter values", () => {
    render(
      <FilterPanel
        filters={{ priceMin: 20, priceMax: 80, category: "jackets", size: "M" }}
        categories={categories}
        sizes={sizes}
        onChange={jest.fn()}
      />
    )

    expect(screen.getByTestId("chat-filter-price-min")).toHaveValue(20)
    expect(screen.getByTestId("chat-filter-price-max")).toHaveValue(80)
    expect(screen.getByTestId("chat-filter-category")).toHaveTextContent("jackets")
    expect(screen.getByTestId("chat-filter-size")).toHaveTextContent("M")
  })

  it("reports each input change to onChange", () => {
    const onChange = jest.fn()
    render(
      <FilterPanel
        filters={{}}
        categories={categories}
        sizes={sizes}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByTestId("chat-filter-price-min"), {
      target: { value: "25" },
    })
    expect(onChange).toHaveBeenLastCalledWith({ priceMin: 25 })

    fireEvent.change(screen.getByTestId("chat-filter-price-max"), {
      target: { value: "90" },
    })
    expect(onChange).toHaveBeenLastCalledWith({ priceMax: 90 })

    pickOption("chat-filter-category", "running-shoes")
    expect(onChange).toHaveBeenLastCalledWith({ category: "running-shoes" })

    pickOption("chat-filter-size", "41")
    expect(onChange).toHaveBeenLastCalledWith({ size: "41" })
  })

  it("clears a field when its value is emptied or invalid", () => {
    const onChange = jest.fn()
    render(
      <FilterPanel
        filters={{ priceMax: 80, category: "jackets", size: "M" }}
        categories={categories}
        sizes={sizes}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByTestId("chat-filter-price-max"), {
      target: { value: "" },
    })
    expect(onChange).toHaveBeenLastCalledWith({
      priceMax: undefined,
      category: "jackets",
      size: "M",
    })

    fireEvent.change(screen.getByTestId("chat-filter-price-max"), {
      target: { value: "-5" },
    })
    expect(onChange).toHaveBeenLastCalledWith({
      priceMax: undefined,
      category: "jackets",
      size: "M",
    })

    pickOption("chat-filter-category", "All categories")
    expect(onChange).toHaveBeenLastCalledWith({
      priceMax: 80,
      category: undefined,
      size: "M",
    })

    pickOption("chat-filter-size", "Any size")
    expect(onChange).toHaveBeenLastCalledWith({
      priceMax: 80,
      category: "jackets",
      size: undefined,
    })
  })
})
