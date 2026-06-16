import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const week = url.searchParams.get("week");
  const index = await store.getMarketingIndex();

  if (!week) return NextResponse.json(index);

  const data = await store.getMarketingWeek(week);
  if (!data) return NextResponse.json({ error: `No data for week ${week}` }, { status: 404 });
  return NextResponse.json(data);
}
