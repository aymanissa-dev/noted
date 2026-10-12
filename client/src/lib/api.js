const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const TOKEN_KEY = 'noted.token';

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, body) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  register: (body) => request('POST', '/auth/register', body),
  login: (body) => request('POST', '/auth/login', body),
  me: () => request('GET', '/auth/me'),
  listNotes: ({ search, tag, view } = {}) => {
    const q = new URLSearchParams();
    if (view && view !== 'active') q.set('view', view);
    if (search) q.set('search', search);
    if (tag) q.set('tag', tag);
    const qs = q.toString();
    return request('GET', `/notes${qs ? `?${qs}` : ''}`);
  },
  tags: () => request('GET', '/notes/tags'),
  getNote: (id) => request('GET', `/notes/${id}`),
  createNote: (body) => request('POST', '/notes', body),
  updateNote: (id, body) => request('PUT', `/notes/${id}`, body),
  togglePin: (id) => request('PATCH', `/notes/${id}/pin`),
  deleteNote: (id) => request('DELETE', `/notes/${id}`), // moves to trash
  deleteForever: (id) => request('DELETE', `/notes/${id}?permanent=true`),
  toggleArchive: (id) => request('PATCH', `/notes/${id}/archive`),
  restoreNote: (id) => request('POST', `/notes/${id}/restore`),
  emptyTrash: () => request('DELETE', '/notes/trash'),
};
