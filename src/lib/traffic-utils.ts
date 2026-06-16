import type { ChannelRow } from "./types";

export const CHANNEL_COLORS: Record<string, string> = {
  "Paid Social": "#ddc087", Direct: "#335338", "Organic Social": "#7aaf80",
  "Organic Search": "#3a6b40", "Paid Search": "#866042", Unassigned: "#aab0a8",
  "Cross-network": "#2a3c30", Referral: "#5a8a5e", Email: "#c4a97a",
  SMS: "#8fa894", "Paid Other": "#d4a870", "Organic Video": "#b7ccbc", Display: "#cccccc",
};
export const colorFor = (name: string) => CHANNEL_COLORS[name] ?? "#888888";

export const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
export const pct = (v: number, d = 1) => (v * 100).toFixed(d) + "%";
export const fmtDur = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m === 0 ? `${sec}s` : `${m}m ${sec < 10 ? "0" : ""}${sec}s`;
};

/** Composite engagement-quality score 0..1 (low bounce + dwell time + engagement). */
export const qScore = (r: ChannelRow) =>
  (1 - r.bounce) * 0.35 + Math.min(r.duration / 300, 1) * 0.35 + r.engagement * 0.3;

export const qLabel = (s: number) =>
  s >= 0.6 ? { label: "Excellent", cls: "q-excellent" }
  : s >= 0.45 ? { label: "Good", cls: "q-good" }
  : s >= 0.3 ? { label: "Fair", cls: "q-fair" }
  : { label: "Poor", cls: "q-poor" };

export function totals(rows: ChannelRow[]) {
  const sessions = rows.reduce((s, r) => s + r.sessions, 0);
  const users = rows.reduce((s, r) => s + r.users, 0);
  const bounce = sessions ? rows.reduce((s, r) => s + r.sessions * r.bounce, 0) / sessions : 0;
  const duration = sessions ? rows.reduce((s, r) => s + r.sessions * r.duration, 0) / sessions : 0;
  const engagement = sessions ? rows.reduce((s, r) => s + r.sessions * r.engagement, 0) / sessions : 0;
  return { sessions, users, bounce, duration, engagement };
}

export function trendPill(val: number, avg: number, higherIsBetter: boolean) {
  if (!avg) return null;
  const diffPct = ((val - avg) / avg) * 100;
  const neutral = Math.abs(diffPct) < 2;
  const better = higherIsBetter ? val > avg : val < avg;
  const cls = neutral ? "trend-neu" : better ? "trend-good" : "trend-bad";
  return { cls, text: `${val > avg ? "↑" : "↓"} ${Math.abs(diffPct).toFixed(1)}%` };
}
