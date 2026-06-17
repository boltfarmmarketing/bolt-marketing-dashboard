import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { fetchDaySnapshot, fetchTrafficData } from "@/lib/windsor";

export const dynamic = "force-dynamic";

// Temporary diagnostic — guarded by CRON_SECRET. Exercises the real page code paths.
export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.WINDSOR_API_KEY || "";
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let dayResult = "n/a", rangeResult = "n/a";
  try {
    const s = await fetchDaySnapshot(yesterday);
    dayResult = "ok sessions=" + s.day.reduce((a, r) => a + r.sessions, 0);
  } catch (e) {
    dayResult = "ERR " + (e as Error).message;
  }
  try {
    const t = await fetchTrafficData(new Date(), 30);
    rangeResult = "ok sessions=" + t.channel.reduce((a, r) => a + r.sessions, 0);
  } catch (e) {
    rangeResult = "ERR " + (e as Error).message;
  }

  return NextResponse.json({
    keyPrefix: key.slice(0, 6),
    keyLen: key.length,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    fetchDaySnapshot: dayResult,
    fetchTrafficData: rangeResult,
  });
}
