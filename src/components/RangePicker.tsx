"use client";

import { useRouter, useSearchParams } from "next/navigation";

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

export default function RangePicker({ active }: { active: number }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="week-picker">
      <select
        className="pick-select"
        aria-label="Select time period"
        value={active}
        onChange={(e) => {
          const sp = new URLSearchParams(params.toString());
          sp.set("range", e.target.value);
          router.push(`/traffic?${sp.toString()}`);
        }}
      >
        {RANGES.map((r) => (
          <option key={r.days} value={r.days}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
