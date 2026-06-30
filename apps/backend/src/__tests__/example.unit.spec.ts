describe("Jest setup", () => {
  it("runs a basic test", () => {
    expect(1 + 1).toBe(2);
  });

  it("supports TypeScript types", () => {
    const greet = (name: string): string => `Hello, ${name}`;
    expect(greet("world")).toBe("Hello, world");
  });
});
