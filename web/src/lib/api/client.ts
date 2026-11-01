import type { AuthSession, Pagination } from "./types";

/**
 * Single HTTP entry point for the Fastify API.
 *
 * - Access tokens live in memory; only the rotating refresh token is persisted
 *   so a page reload can restore the session. Nothing else is stored.
 * - A 401 triggers one single-flight refresh, then the original request retries.
 * - Errors are normalised into `ApiError` so the UI can surface messages.
 */

const DEFAULT_BASE_URL = "http://localhost:4000/api";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

const REFRESH_STORAGE_KEY = "corestone.auth.refreshToken";
const PORTAL_STORAGE_KEY = "corestone.auth.portal";

export type PortalName = "client" | "admin" | "super-admin";

export interface ApiErrorPayload {
  error?: { code?: string; message?: string; details?: unknown };
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** First field-level validation message, if the server returned any. */
  get fieldMessage(): string | null {
    const details = this.details as { issues?: Array<{ path?: string; message?: string }> } | undefined;
    const first = details?.issues?.[0];
    if (!first?.message) return null;
    return first.path ? `${first.path}: ${first.message}` : first.message;
  }
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let portal: PortalName | null = null;
let hydrated = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeToAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const store = storage();
  if (!store) return;
  refreshToken = store.getItem(REFRESH_STORAGE_KEY);
  const storedPortal = store.getItem(PORTAL_STORAGE_KEY);
  portal = storedPortal === "client" || storedPortal === "admin" || storedPortal === "super-admin" ? storedPortal : null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  hydrate();
  return refreshToken;
}

export function getPortal(): PortalName | null {
  hydrate();
  return portal;
}

export function hasStoredSession(): boolean {
  return Boolean(getRefreshToken());
}

export function storeSession(session: AuthSession): void {
  accessToken = session.accessToken;
  refreshToken = session.refreshToken;
  if (session.portal) portal = session.portal;
  const store = storage();
  if (store) {
    store.setItem(REFRESH_STORAGE_KEY, session.refreshToken);
    if (portal) store.setItem(PORTAL_STORAGE_KEY, portal);
  }
  emit();
}

export function updateAccessToken(token: string, nextRefreshToken?: string): void {
  accessToken = token;
  if (nextRefreshToken) {
    refreshToken = nextRefreshToken;
    storage()?.setItem(REFRESH_STORAGE_KEY, nextRefreshToken);
  }
  emit();
}

export function clearSession(): void {
  accessToken = null;
  refreshToken = null;
  portal = null;
  const store = storage();
  if (store) {
    store.removeItem(REFRESH_STORAGE_KEY);
    store.removeItem(PORTAL_STORAGE_KEY);
  }
  emit();
}

export type QueryValue = string | number | boolean | null | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toApiError(response: Response, body: unknown): ApiError {
  const payload = (body ?? {}) as ApiErrorPayload;
  const code = payload.error?.code ?? `HTTP_${response.status}`;
  const message =
    payload.error?.message ??
    (typeof body === "string" && body ? body : response.statusText) ??
    "Request failed";
  return new ApiError(response.status, code, message, payload.error?.details, payload.requestId);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Rotates the refresh token. Returns false when the session is gone. */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const token = getRefreshToken();
  if (!token) return Promise.resolve(false);

  refreshInFlight = (async () => {
    try {
      const response = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
      const body = await parseBody(response);
      if (!response.ok) {
        clearSession();
        return false;
      }
      const data = (body as { data?: AuthSession }).data;
      if (!data?.accessToken) {
        clearSession();
        return false;
      }
      updateAccessToken(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Multipart payloads must not set a JSON content-type. */
  formData?: FormData;
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", query, body, auth = true, headers = {}, signal, formData } = options;

  const send = async (): Promise<Response> => {
    const requestHeaders: Record<string, string> = { accept: "application/json", ...headers };
    if (auth) {
      const token = accessToken;
      if (token) requestHeaders["authorization"] = `Bearer ${token}`;
    }
    let payload: BodyInit | undefined;
    if (formData) {
      payload = formData;
    } else if (body !== undefined) {
      requestHeaders["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    return fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      ...(payload !== undefined ? { body: payload } : {}),
      ...(signal ? { signal } : {}),
    });
  };

  let response = await send();

  if (response.status === 401 && auth) {
    const refreshed = await refreshSession();
    if (refreshed) response = await send();
  }

  return response;
}

/** Returns the raw response body (usually `{ data: ... }`). */
export async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const response = await rawRequest(path, options);
  const body = await parseBody(response);
  if (!response.ok) throw toApiError(response, body);
  return body;
}

/** Returns the `data` envelope. */
export async function requestData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const body = (await request(path, options)) as { data?: T } | null;
  return (body?.data ?? (null as unknown)) as T;
}

/** Returns the combined `{ data, pagination }` envelope used by list endpoints. */
export async function requestPage<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T[]; pagination: Pagination; [key: string]: unknown }> {
  const body = (await request(path, options)) as
    | { data?: T[]; pagination?: Pagination; [key: string]: unknown }
    | null;
  return {
    ...(body ?? {}),
    data: body?.data ?? [],
    pagination: body?.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  };
}

/** Fetches a signed document URL and returns it as a blob. */
export async function downloadBlob(url: string): Promise<Blob> {
  const absolute = url.startsWith("http") ? url : `${API_BASE_URL.replace(/\/api$/, "")}${url}`;
  const response = await fetch(absolute, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) {
    throw toApiError(response, await parseBody(response));
  }
  return response.blob();
}

/** Triggers a browser download for a blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isApiError(error)) return error.fieldMessage ?? error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
