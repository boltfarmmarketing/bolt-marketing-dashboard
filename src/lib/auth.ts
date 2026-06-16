import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "bf_admin";

function sessionToken(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update("admin-session-v1").digest("hex");
}

export function adminEnabled(): boolean {
  return !!process.env.ADMIN_PASSWORD;
}

export async function isAuthed(): Promise<boolean> {
  const c = await cookies();
  return c.get(COOKIE)?.value === sessionToken();
}

export async function login(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || password !== expected) return false;
  const c = await cookies();
  c.set(COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
