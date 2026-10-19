import { describe, expect, it } from "vitest";
import { taskInputSchema, taskUpdateSchema } from "./validation.js";

describe("task validation", () => {
  it("normalizes task input and applies a safe default priority", () => {
    expect(taskInputSchema.parse({ title: "  Prepare notes  " })).toMatchObject({
      title: "Prepare notes",
      priority: "medium",
    });
  });

  it("rejects invalid priorities and empty patches", () => {
    expect(taskInputSchema.safeParse({ title: "Review", priority: "urgent" }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({}).success).toBe(false);
  });
});
