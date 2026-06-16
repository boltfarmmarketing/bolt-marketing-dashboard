import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { store } from "@/lib/store";
import { fetchTrafficData } from "@/lib/windsor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const data = await fetchTrafficData();
    await store.saveTraffic(data);
    return NextResponse.json({
      ok: true,
      generatedAt: data.generatedAt,
      channels: data.channel.length,
      days: data.daily.length,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
