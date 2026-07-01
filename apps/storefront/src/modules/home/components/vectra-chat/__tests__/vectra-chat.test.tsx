import { render, screen, fireEvent } from "@testing-library/react"
import VectraChat from "../index"

jest.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
  useRouter: () => ({ push: jest.fn() }),
}))

// jsdom does not implement element scrolling; the chat autoscrolls on mount.
beforeAll(() => {
  HTMLElement.prototype.scrollTo = jest.fn()
})

describe("VectraChat composer", () => {
  const openChat = () =>
    fireEvent.click(screen.getByRole("button", { name: "Ask Vectra" }))
  const getComposer = () =>
    screen.getByPlaceholderText("Describe what you're looking for…")

  it("keeps typed text while the panel is open", () => {
    render(<VectraChat products={[]} />)
    openChat()

    fireEvent.change(getComposer(), { target: { value: "trail running shoes" } })

    expect(getComposer()).toHaveValue("trail running shoes")
  })

  it("clears the composer when the panel closes and stays empty on reopen", () => {
    render(<VectraChat products={[]} />)
    openChat()
    fireEvent.change(getComposer(), { target: { value: "trail running shoes" } })

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(getComposer()).toHaveValue("")

    openChat()
    expect(getComposer()).toHaveValue("")
  })

  it("also clears the composer when closed with Escape", () => {
    render(<VectraChat products={[]} />)
    openChat()
    fireEvent.change(getComposer(), { target: { value: "waterproof jacket" } })

    fireEvent.keyDown(document, { key: "Escape" })

    expect(getComposer()).toHaveValue("")
  })
})
