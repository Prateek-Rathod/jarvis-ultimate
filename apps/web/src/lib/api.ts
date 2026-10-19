export interface ApiErrorPayload {
  success: false;
  error: { code: string; message: string };
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
let csrfToken: string | null = null;

export function normalizeApiBaseUrl(
  value: string,
  options: { production: boolean; pageOrigin?: string },
): string {
  const configuredValue = value.trim().replace(/\/+$/, "");
  if (!configuredValue) {
    if (options.production) {
      throw new ApiError(
        "VITE_API_BASE_URL is missing. Set it to this Vercel site's HTTPS origin; API requests are proxied to the backend.",
        0,
        "API_CONFIG_INVALID",
      );
    }
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(configuredValue);
  } catch {
    throw new ApiError(
      "VITE_API_BASE_URL must be a valid HTTP(S) origin.",
      0,
      "API_CONFIG_INVALID",
    );
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ApiError(
      "VITE_API_BASE_URL must contain only an HTTP(S) origin, without credentials or a path.",
      0,
      "API_CONFIG_INVALID",
    );
  }

  if (options.production && parsed.protocol !== "https:") {
    throw new ApiError("VITE_API_BASE_URL must use HTTPS in production.", 0, "API_CONFIG_INVALID");
  }

  if (
    options.production &&
    (parsed.hostname === "localhost" ||
      parsed.hostname.endsWith(".localhost") ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]" ||
      parsed.hostname === "0.0.0.0")
  ) {
    throw new ApiError(
      "VITE_API_BASE_URL cannot point to localhost in production.",
      0,
      "API_CONFIG_INVALID",
    );
  }

  if (options.production && options.pageOrigin && parsed.origin !== options.pageOrigin) {
    throw new ApiError(
      "VITE_API_BASE_URL must match this Vercel site's origin so session cookies remain same-site.",
      0,
      "API_CONFIG_INVALID",
    );
  }

  return parsed.origin;
}

export function buildApiUrl(path: string): string {
  const baseUrl = normalizeApiBaseUrl(API_BASE_URL, {
    production: import.meta.env.PROD,
    ...(import.meta.env.PROD ? { pageOrigin: window.location.origin } : {}),
  });
  const normalizedPath = path.replace(/^\/+/, "");
  return baseUrl ? new URL(normalizedPath, `${baseUrl}/`).toString() : `/${normalizedPath}`;
}

export function setCsrfToken(value: string | null): void {
  csrfToken = value;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (
    csrfToken &&
    ["POST", "PATCH", "PUT", "DELETE"].includes(options.method?.toUpperCase() ?? "GET")
  ) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    let response: Response;
    try {
      response = await fetch(buildApiUrl(path), {
        ...options,
        headers,
        credentials: "include",
        signal,
      });
    } catch (cause) {
      if (options.signal?.aborted) throw cause;
      if (timeoutController.signal.aborted) {
        throw new ApiError(
          "The request timed out. Check the API and try again.",
          0,
          "REQUEST_TIMEOUT",
        );
      }
      if (cause instanceof TypeError) {
        throw new ApiError(
          "The API is temporarily unavailable. Check that the server is running, then retry.",
          0,
          "API_UNAVAILABLE",
        );
      }
      throw cause;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = payload as ApiErrorPayload | null;
      throw new ApiError(
        parsed?.error?.message ?? `Request failed (${response.status}).`,
        response.status,
        parsed?.error?.code ?? "REQUEST_FAILED",
      );
    }
    return (payload as { data: T }).data;
  } finally {
    clearTimeout(timeoutId);
  }
}
