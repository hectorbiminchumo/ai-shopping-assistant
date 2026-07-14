import "@testing-library/jest-dom"

// jsdom lacks ResizeObserver; Headless UI's anchored popovers require it
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
