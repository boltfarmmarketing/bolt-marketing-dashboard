"use client";

import { useEffect, useRef } from "react";
import { Chart, registerables } from "chart.js";
import type { ChannelRow, DailyPoint } from "@/lib/types";
import { colorFor } from "@/lib/traffic-utils";

Chart.register(...registerables);

const FONT = "'Ovo', serif";
const GRID = "rgba(56,58,66,0.08)";
const TEXT = "#383a42";

function useChart(create: (canvas: HTMLCanvasElement) => Chart, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = create(ref.current);
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export function DailyTrendChart({ daily }: { daily: DailyPoint[] }) {
  const ref = useChart(
    (canvas) =>
      new Chart(canvas, {
        type: "line",
        data: {
          labels: daily.map((d) => d.date),
          datasets: [
            { label: "Sessions", data: daily.map((d) => d.sessions), borderColor: "#335338", backgroundColor: "rgba(51,83,56,0.08)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
            { label: "Active Users", data: daily.map((d) => d.users), borderColor: "#ddc087", backgroundColor: "transparent", fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { font: { family: FONT }, color: TEXT, usePointStyle: true } } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { family: FONT }, color: TEXT, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
            y: { grid: { color: GRID }, ticks: { font: { family: FONT }, color: TEXT } },
          },
        },
      }),
    [daily]
  );
  return <canvas ref={ref} />;
}

export function ChannelBarChart({
  rows, metric, label, asPercent = false,
}: {
  rows: ChannelRow[];
  metric: "bounce" | "duration" | "engagement";
  label: string;
  asPercent?: boolean;
}) {
  const ref = useChart(
    (canvas) =>
      new Chart(canvas, {
        type: "bar",
        data: {
          labels: rows.map((r) => r.name),
          datasets: [
            {
              label,
              data: rows.map((r) => (asPercent ? r[metric] * 100 : r[metric])),
              backgroundColor: rows.map((r) => colorFor(r.name)),
              borderRadius: 6,
            },
          ],
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: label, font: { family: FONT, size: 13 }, color: TEXT },
          },
          scales: {
            x: { grid: { color: GRID }, ticks: { font: { family: FONT }, color: TEXT, callback: (v) => (asPercent ? v + "%" : v) } },
            y: { grid: { display: false }, ticks: { font: { family: FONT, size: 10 }, color: TEXT } },
          },
        },
      }),
    [rows, metric]
  );
  return <canvas ref={ref} />;
}
