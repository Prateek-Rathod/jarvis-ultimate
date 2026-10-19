import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, apiRequest, buildApiUrl, getCsrfToken, setCsrfToken } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setCsrfToken(null);
});

describe("apiRequest", () => {
  it("builds API URLs from the configured base URL", () => {
    expect(API_BASE_URL.endsWith("/")).toBe(false);
    expect(buildApiUrl("/api/v1/auth/session")).toBe(`${API_BASE_URL}/api/v1/auth/session`);
  });

  it("returns the API data envelope and includes session credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: "task-1" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest<{ id: string }>("/api/v1/tasks")).resolves.toEqual({ id: "task-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      buildApiUrl("/api/v1/tasks"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("sends the session CSRF token on mutating requests", async () => {
    setCsrfToken("test-csrf-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { created: true },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await apiRequest("/api/v1/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Write tests" }),
    });
    const requestInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(new Headers(requestInit.headers).get("X-CSRF-Token")).toBe("test-csrf-token");
    expect(getCsrfToken()).toBe("test-csrf-token");
  });

  it("surfaces server error messages and codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "AI_PROVIDER_NOT_CONFIGURED", message: "Configure an AI provider." },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(apiRequest("/api/v1/conversations/id/messages")).rejects.toMatchObject({
      status: 503,
      code: "AI_PROVIDER_NOT_CONFIGURED",
      message: "Configure an AI provider.",
    });
  });

  it("reports temporary network failures without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/api/v1/auth/session")).rejects.toMatchObject({
      status: 0,
      code: "API_UNAVAILABLE",
      message: expect.stringContaining("temporarily unavailable"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out a stalled request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_path: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const assertion = expect(apiRequest("/api/v1/auth/session")).rejects.toMatchObject({
      status: 0,
      code: "REQUEST_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    vi.useRealTimers();
  });
});
