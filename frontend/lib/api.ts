import { store } from "@/lib/store";
import { setAccessToken } from "@/lib/features/authSlice";
import { BASE_URL } from "@/lib/config";
import { ApiError, NetworkError, errorMessage } from "@/lib/apiError";

// Backoff between automatic retries of a dropped connection. Only GET
// requests retry automatically — a POST/PATCH/DELETE that never reached the
// server could just as easily have reached it and failed on the way back,
// so silently replaying it risks a duplicate write. Reads are safe to retry.
const NETWORK_RETRY_DELAYS_MS = [400, 1200];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          store.dispatch(setAccessToken(null));
          return false;
        }
        const data = await res.json();
        store.dispatch(setAccessToken(data.access));
        return true;
      })
      .catch(() => {
        store.dispatch(setAccessToken(null));
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  skipAuthRetry?: boolean;
  networkRetriesLeft?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, skipAuthRetry } = options;
  const networkRetriesLeft =
    options.networkRetriesLeft ?? (method === "GET" ? NETWORK_RETRY_DELAYS_MS.length : 0);
  const token = store.getState().auth.accessToken;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (networkRetriesLeft > 0) {
      const attempt = NETWORK_RETRY_DELAYS_MS.length - networkRetriesLeft;
      await sleep(NETWORK_RETRY_DELAYS_MS[attempt]);
      return request<T>(path, { ...options, networkRetriesLeft: networkRetriesLeft - 1 });
    }
    throw new NetworkError();
  }

  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, data);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { ApiError, NetworkError, errorMessage, BASE_URL, refreshAccessToken };
