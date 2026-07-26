export const DASHBOARD_SESSION_COOKIE = "simplemailer_dashboard_session";
export const DASHBOARD_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function encode(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function signature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return encode(new Uint8Array(signed));
}

export function dashboardSessionConfigured(): boolean {
  return Boolean(
    process.env.DASHBOARD_PASSWORD &&
    process.env.DASHBOARD_SESSION_SECRET &&
    new TextEncoder().encode(process.env.DASHBOARD_SESSION_SECRET).byteLength >= 32,
  );
}

export function allowUnauthenticatedLocalDashboard(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.DASHBOARD_PASSWORD;
}

export async function createDashboardSession(secret: string, now = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + DASHBOARD_SESSION_MAX_AGE_SECONDS;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${await signature(payload, secret)}`;
}

export async function verifyDashboardSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const [version, expiresAtRaw, providedSignature, extra] = token.split(".");
  if (version !== "v1" || !expiresAtRaw || !providedSignature || extra) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const expected = await signature(`${version}.${expiresAtRaw}`, secret);
  if (expected.length !== providedSignature.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ providedSignature.charCodeAt(index);
  }
  return difference === 0;
}
