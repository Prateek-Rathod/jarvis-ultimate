import { readFileSync } from "node:fs";
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

  it("routes API and health requests through the same-origin Vercel proxy", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"),
    ) as { rewrites: Array<{ source: string; destination: string }> };
    expect(config.rewrites).toEqual([
      {
        source: "/api/:path*",
        destination: "https://jarvis-ultimate.onrender.com/api/:path*",
      },
      {
        source: "/health/:path*",
        destination: "https://jarvis-ultimate.onrender.com/health/:path*",
      },
      {
        source: "/(.*)",
        destination: "/index.html",
      },
    ]);
  });
});
