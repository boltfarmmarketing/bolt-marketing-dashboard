"use client";

import { useRouter } from "next/navigation";
import type { WeekIndexEntry } from "@/lib/types";

export default function WeekPicker({ weeks, active }: { weeks: WeekIndexEntry[]; active: string }) {
  const router = useRouter();
  const fmt = (e: WeekIndexEntry) => {
    const d = (iso: string) =>
      new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `Week of ${d(e.start)} – ${d(e.end)}`;
  };
  return (
    <div className="week-picker">
      <select
        className="pick-select"
        aria-label="Select week"
        value={active}
        onChange={(e) => router.push(`/?week=${e.target.value}`)}
      >
        {[...weeks].reverse().map((w) => (
          <option key={w.weekOf} value={w.weekOf}>
            {fmt(w)}
          </option>
        ))}
      </select>
    </div>
  );
}
