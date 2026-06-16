/** Verify the request carries the Vercel cron secret (Authorization: Bearer <CRON_SECRET>). */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: no secret configured → no access
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
