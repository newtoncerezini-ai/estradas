const AUTH_TOKEN_KEY = "estradas-auth-token";
const AUTH_USER_KEY = "estradas-auth-user";
const DEFAULT_AUTH_URL = "/api/auth";

function useLocalAuth() {
  return (import.meta.env.VITE_ESTRADAS_AUTH_MODE || "local") === "local";
}

function localCredentials() {
  return {
    username: import.meta.env.VITE_ESTRADAS_LOCAL_USER || "admin",
    password: import.meta.env.VITE_ESTRADAS_LOCAL_PASSWORD || "123@mudar"
  };
}

function authBaseUrl() {
  return import.meta.env.VITE_ESTRADAS_AUTH_URL || DEFAULT_AUTH_URL;
}

function readStoredUser() {
  try {
    const raw = window.sessionStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function getStoredAuthUser() {
  if (typeof window === "undefined") return null;
  return readStoredUser();
}

export function hasStoredAuthSession() {
  return Boolean(getAuthToken());
}

export function clearAuthSession() {
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_USER_KEY);
}

function storeAuthSession(data) {
  window.sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
  window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
}

function storeLocalSession() {
  const user = {
    username: "admin",
    fullName: "Administrador",
    role: "viewer",
    isLocalMask: true
  };
  storeAuthSession({
    token: `local-mask-${Date.now()}`,
    user
  });
  return user;
}

async function authFetch(path, options = {}) {
  const token = getAuthToken();
  const response = await fetch(`${authBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Falha na requisicao (${response.status})`);
  }

  return data;
}

export async function loginUser(username, password) {
  if (useLocalAuth()) {
    const credentials = localCredentials();
    if (username === credentials.username && password === credentials.password) {
      return storeLocalSession();
    }
    throw new Error("Usuário ou senha inválidos.");
  }

  const response = await fetch(`${authBaseUrl()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Falha no login (${response.status})`);
  }

  storeAuthSession(data);
  return data.user;
}

export async function loadAuthenticatedUser() {
  const token = getAuthToken();
  if (!token) return null;

  if (useLocalAuth()) {
    return readStoredUser();
  }

  const response = await fetch(`${authBaseUrl()}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!response.ok) {
    clearAuthSession();
    return null;
  }

  const data = await response.json();
  window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export async function logoutUser() {
  const token = getAuthToken();
  clearAuthSession();

  if (!token || useLocalAuth()) return;

  await fetch(`${authBaseUrl()}/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }).catch(() => {});
}

export async function listUsers() {
  const data = await authFetch("/users", { method: "GET" });
  return data.users || [];
}

export async function createUser(payload) {
  const data = await authFetch("/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.user;
}

export async function updateUser(userId, payload) {
  const data = await authFetch(`/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return data.user;
}

export async function updateUserPassword(userId, password) {
  await authFetch(`/users/${userId}/password`, {
    method: "PUT",
    body: JSON.stringify({ password })
  });
}

export async function deleteUser(userId) {
  await authFetch(`/users/${userId}`, { method: "DELETE" });
}
