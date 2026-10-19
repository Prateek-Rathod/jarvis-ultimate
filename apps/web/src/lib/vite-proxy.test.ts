import { describe, expect, it } from "vitest";
import viteConfig, { API_PROXY_TARGET } from "../../vite.config";

describe("Vite API proxy", () => {
  it("forwards API and health routes to the API port without rewriting prefixes", () => {
    expect(viteConfig.server?.proxy).toEqual({
      "/api": API_PROXY_TARGET,
      "/health": API_PROXY_TARGET,
    });
    expect(API_PROXY_TARGET).toBe("http://localhost:3001");
  });
});
