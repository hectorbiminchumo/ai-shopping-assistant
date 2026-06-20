import { render, screen } from "@testing-library/react"

// Smoke test to verify the Jest + React Testing Library setup works.
function Hello({ name }: { name: string }) {
  return <h1>Hello {name}</h1>
}

describe("Jest setup smoke test", () => {
  it("renders the name", () => {
    render(<Hello name="Vectra" />)
    expect(screen.getByText("Hello Vectra")).toBeInTheDocument()
  })
})
