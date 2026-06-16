"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function DayPicker({ day, max }: { day: string; max: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="day-picker">
      <label htmlFor="day-input">Show day</label>
      <input
        id="day-input"
        type="date"
        className="admin-input day-input"
        value={day}
        max={max}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const sp = new URLSearchParams(params.toString());
          sp.set("day", v);
          router.push(`/traffic?${sp.toString()}`);
        }}
      />
    </div>
  );
}
