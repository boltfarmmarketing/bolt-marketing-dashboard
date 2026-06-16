import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { assembleMarketingWeek, lastCompleteWeekStart } from "@/lib/marketing-pipeline";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    // Allow ?week=YYYY-MM-DD to backfill a specific week; default = last complete week.
    const week = new URL(req.url).searchParams.get("week") || lastCompleteWeekStart();
    const data = await assembleMarketingWeek(week);
    await store.upsertMarketingBase(data);
    return NextResponse.json({ ok: true, weekOf: data.weekOf, metrics: Object.keys(data.metrics) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
