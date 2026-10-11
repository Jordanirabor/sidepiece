export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4002';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function authHeaders(extra: Record<string, string> = {}) {
  const token = localStorage.getItem('sidepiece_token');
  return token ? { ...extra, authorization: `Bearer ${token}` } : extra;
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({ ok: false, error: res.statusText }));
  if (!res.ok || !body.ok) throw new ApiError(res.status, body.error ?? `request failed (${res.status})`);
  return body.data as T;
}

export const api = {
  get: <T,>(path: string, query?: Record<string, string>) =>
    fetch(`${API}${path}${query ? `?${new URLSearchParams(query)}` : ''}`, { headers: authHeaders() }).then(unwrap<T>),
  post: <T,>(path: string, body: unknown) =>
    fetch(`${API}${path}`, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    }).then(unwrap<T>),
};
