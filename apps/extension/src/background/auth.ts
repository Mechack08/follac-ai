/**
 * Extension auth — per-user sessions against the Follac API.
 *
 * Sign-in hits better-auth's email endpoint; the `bearer` plugin returns the
 * session token in the `set-auth-token` response header. We store it in
 * chrome.storage.local and attach it as `Authorization: Bearer <token>` on
 * every API call. No shared secrets are baked into the build anymore.
 */

const SERVER_BASE = "http://localhost:3001";
const TOKEN_KEY = "follac_session_token";
const USER_KEY = "follac_user";

export interface FollacUser {
  id: string;
  email: string;
  name: string;
}

export async function getToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return (stored[TOKEN_KEY] as string | undefined) ?? null;
}

export async function getStoredUser(): Promise<FollacUser | null> {
  const stored = await chrome.storage.local.get(USER_KEY);
  return (stored[USER_KEY] as FollacUser | undefined) ?? null;
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: FollacUser }> {
  const response = await fetch(`${SERVER_BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? "Invalid email or password");
  }

  const token = response.headers.get("set-auth-token");
  if (!token) throw new Error("Server did not return a session token");

  const body = (await response.json()) as { user: FollacUser };
  await chrome.storage.local.set({ [TOKEN_KEY]: token, [USER_KEY]: body.user });
  return { user: body.user };
}

export async function signOut(): Promise<void> {
  const token = await getToken();
  if (token) {
    await fetch(`${SERVER_BASE}/api/auth/sign-out`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
  }
  await chrome.storage.local.remove([TOKEN_KEY, USER_KEY]);
}

export async function getSession(): Promise<FollacUser | null> {
  const token = await getToken();
  if (!token) return null;
  const response = await fetch(`${SERVER_BASE}/api/auth/get-session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    await chrome.storage.local.remove([TOKEN_KEY, USER_KEY]);
    return null;
  }
  const body = (await response.json()) as { user: FollacUser } | null;
  return body?.user ?? null;
}

/** Authenticated fetch used by the service worker's proxy */
export async function authedFetch(url: string, body: unknown): Promise<Response> {
  const token = await getToken();
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
