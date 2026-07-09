let accessToken: string | null = null;
type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  listeners.forEach((listener) => listener(token));
}

export function subscribeToken(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
