import { describe, expect, it } from "vitest";
import { memoryInputSchema, memoryUpdateSchema } from "./validation.js";

describe("memory validation", () => {
  it("trims and categorizes explicit user memories", () => {
    expect(memoryInputSchema.parse({ content: "  Prefer short summaries.  " })).toMatchObject({
      content: "Prefer short summaries.",
      category: "preference",
      enabled: true,
    });
  });

  it("rejects credential-shaped content", () => {
    expect(
      memoryInputSchema.safeParse({
        content: "My API key: sk-example-private-value",
      }).success,
    ).toBe(false);
    expect(
      memoryUpdateSchema.safeParse({
        content: "password = secret-value",
      }).success,
    ).toBe(false);
  });

  it("rejects empty updates", () => {
    expect(memoryUpdateSchema.safeParse({}).success).toBe(false);
    expect(memoryUpdateSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });
});
