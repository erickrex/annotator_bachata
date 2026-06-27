import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Generate schema</Button>);
    expect(
      screen.getByRole("button", { name: "Generate schema" }),
    ).toBeInTheDocument();
  });

  it("applies variant + size classes", () => {
    render(
      <Button variant="outline" size="lg">
        Export
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Export" });
    expect(btn.className).toContain("border");
    expect(btn.className).toContain("h-10");
  });
});
