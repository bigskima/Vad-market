import { parseApiError } from "@vad/schemas";
import type { ApiError, RequestMetadata } from "@vad/types";

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
}

export interface ApiRequestOptions
  extends Omit<RequestInit, "body" | "headers">,
    Partial<RequestMetadata> {
  body?: unknown;
  headers?: Record<string, string>;
}

export class VadApiError extends Error {
  readonly details: ApiError;

  constructor(details: ApiError) {
    super(details.message);
    this.name = "VadApiError";
    this.details = details;
  }
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function request<T>(
    path: string,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> {
    const token = await options.getAccessToken?.();
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...requestOptions.headers,
    };

    if (requestOptions.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (token) headers.Authorization = `Bearer ${token}`;
    if (requestOptions.request_id) {
      headers["X-Request-Id"] = requestOptions.request_id;
    }
    if (requestOptions.idempotency_key) {
      headers["Idempotency-Key"] = requestOptions.idempotency_key;
    }

    const response = await fetchImpl(`${baseUrl}/${path.replace(/^\//, "")}`, {
      ...requestOptions,
      headers,
      body:
        requestOptions.body === undefined
          ? undefined
          : JSON.stringify(requestOptions.body),
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const parsed = parseApiError(
        payload && typeof payload === "object" && "error" in payload
          ? (payload as { error: unknown }).error
          : payload,
      );

      if (parsed) throw new VadApiError(parsed);

      throw new Error(`VAD API request failed with status ${response.status}`);
    }

    return payload as T;
  }

  return { request } as const;
}
