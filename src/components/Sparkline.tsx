import type { MetricPoint } from "@/lib/types";

/** Tiny inline SVG sparkline — server-rendered, no client JS. */
export default function Sparkline({ points, width = 220, height = 38 }: { points: MetricPoint[]; width?: number; height?: number }) {
  if (!points || points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const stepX = (width - pad * 2) / (points.length - 1);

  const coords = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];
  const area = `${path} L${lastX.toFixed(1)},${height - pad} L${pad},${height - pad} Z`;

  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill="rgba(51,83,56,0.08)" stroke="none" />
      <path d={path} fill="none" stroke="var(--dark-green)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.6" fill="var(--sienna)" />
    </svg>
  );
}
