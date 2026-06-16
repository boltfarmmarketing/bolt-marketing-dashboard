import { unstable_cache } from "next/cache";
import Nav from "@/components/Nav";
import RangePicker from "@/components/RangePicker";
import { ChannelBarChart, DailyTrendChart } from "@/components/TrafficCharts";
import { store } from "@/lib/store";
import {
  colorFor, fmtDur, fmtNum, pct, qLabel, qScore, totals, trendPill,
} from "@/lib/traffic-utils";
import type { ChannelRow, TrafficData } from "@/lib/types";
import { fetchTrafficData } from "@/lib/windsor";

export const dynamic = "force-dynamic";

const ALLOWED_RANGES = [7, 14, 30, 90];

/**
 * Load traffic for the selected range. With a Windsor key we pull live (cached
 * 30 min per range/day); otherwise we fall back to the stored snapshot/seed.
 */
async function loadTraffic(days: number): Promise<TrafficData> {
  if (process.env.WINDSOR_API_KEY) {
    try {
      const dayKey = new Date().toISOString().slice(0, 10);
      return await unstable_cache(
        () => fetchTrafficData(new Date(), days),
        ["traffic", String(days), dayKey],
        { revalidate: 1800 }
      )();
    } catch {
      /* fall through to snapshot */
    }
  }
  return store.getTraffic();
}

function YdayDeltaPill({ val, avg, higherIsBetter }: { val: number; avg: number; higherIsBetter: boolean }) {
  const t = trendPill(val, avg, higherIsBetter);
  if (!t) return null;
  return <span className={`trend-pill ${t.cls}`}>{t.text}</span>;
}

function buildInsights(channel: ChannelRow[], daily: { date: string; sessions: number }[]): { tag: string; text: string }[] {
  const out: { tag: string; text: string }[] = [];
  const byScore = [...channel].sort((a, b) => qScore(b) - qScore(a));
  const top = [...channel].sort((a, b) => b.sessions - a.sessions)[0];
  if (top) out.push({ tag: "Top channel", text: `${top.name} drove the most sessions (${fmtNum(top.sessions)}) over the period.` });
  if (byScore[0]) out.push({ tag: "Best quality", text: `${byScore[0].name} has the strongest engagement quality (${pct(qScore(byScore[0]), 0)} score) — low bounce, longer dwell time.` });
  const worst = byScore[byScore.length - 1];
  if (worst && worst.sessions > 100) out.push({ tag: "Needs attention", text: `${worst.name} shows weak engagement (${pct(worst.bounce)} bounce). Worth auditing landing pages or targeting.` });
  const avg = daily.reduce((s, d) => s + d.sessions, 0) / (daily.length || 1);
  const spike = daily.filter((d) => d.sessions > avg * 2.5);
  if (spike.length) out.push({ tag: "Traffic spike", text: `Unusual spike on ${spike.map((s) => s.date).join(", ")} — ${fmtNum(Math.max(...spike.map((s) => s.sessions)))} sessions vs a ${fmtNum(avg)} daily average.` });
  const small = channel.filter((c) => /email|sms/i.test(c.name)).reduce((s, c) => s + c.sessions, 0);
  const totalS = channel.reduce((s, c) => s + c.sessions, 0);
  if (totalS && small / totalS < 0.02) out.push({ tag: "Underused", text: `Email & SMS together are under 2% of sessions — an owned-audience channel with room to grow.` });
  return out;
}

export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const days = ALLOWED_RANGES.includes(Number(range)) ? Number(range) : 30;
  const data = await loadTraffic(days);
  const rangeDays = data.rangeDays ?? days;
  const yday = totals(data.yesterday);
  const wk = totals(data.week);
  const wkDailyAvg = wk.sessions / 7;
  const period = totals(data.channel);
  const wkMap = new Map(data.week.map((r) => [r.name, r]));
  const insights = buildInsights(data.channel, data.daily);
  const topChannels = data.channel.slice(0, 8);

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <div className="eyebrow">Bolt Farm Treehouse</div>
          <h1>
            Traffic <em>Analytics</em>
          </h1>
          <p className="hero-subtitle">Website traffic and channel engagement from GA4, refreshed every morning.</p>
          <div className="hero-meta">{data.rangeLabel} · via Windsor.ai</div>
          <RangePicker active={rangeDays} />
        </div>
      </header>
      <Nav />

      <main className="container">
        {/* Yesterday */}
        <section className="yesterday-block">
          <div className="yday-eyebrow">Yesterday at a glance</div>
          <h2>{data.yesterdayDate}</h2>
          <div className="yday-kpi-row">
            <div className="yday-kpi">
              <div className="yk-label">Sessions</div>
              <div className="yk-value">{fmtNum(yday.sessions)}</div>
              <div className="yk-delta"><YdayDeltaPill val={yday.sessions} avg={wkDailyAvg} higherIsBetter /> <span style={{ opacity: 0.5 }}>vs 7-day avg</span></div>
            </div>
            <div className="yday-kpi">
              <div className="yk-label">Active Users</div>
              <div className="yk-value">{fmtNum(yday.users)}</div>
            </div>
            <div className="yday-kpi">
              <div className="yk-label">Avg Bounce</div>
              <div className="yk-value">{pct(yday.bounce)}</div>
              <div className="yk-delta"><YdayDeltaPill val={yday.bounce} avg={wk.bounce} higherIsBetter={false} /></div>
            </div>
            <div className="yday-kpi">
              <div className="yk-label">Avg Duration</div>
              <div className="yk-value">{fmtDur(yday.duration)}</div>
            </div>
          </div>
          {yday.bounce >= 0.85 && (
            <div className="yday-alert">
              <strong>Anomaly check</strong>
              Yesterday&apos;s bounce rate ({pct(yday.bounce)}) is unusually high. This often signals a tracking
              hiccup (e.g. a tag firing twice) rather than a real traffic-quality collapse — verify in GA4 before acting.
            </div>
          )}
        </section>

        {/* 30-day overview */}
        <section className="section">
          <div className="section-head">
            <div className="section-label">Overview</div>
            <h2>{rangeDays}-Day Overview · {data.rangeLabel}</h2>
          </div>
          <div className="kpi-row">
            <div className="kpi-card"><div className="kpi-label">Total Sessions</div><div className="kpi-value">{fmtNum(period.sessions)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Active Users</div><div className="kpi-value">{fmtNum(period.users)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Avg Bounce Rate</div><div className="kpi-value">{pct(period.bounce)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Avg Session Duration</div><div className="kpi-value">{fmtDur(period.duration)}</div></div>
          </div>
        </section>

        {/* Daily trend */}
        <section className="section">
          <div className="section-head">
            <div className="section-label">Trend</div>
            <h2>Daily Sessions &amp; Active Users</h2>
          </div>
          <div className="chart-card">
            <div className="chart-box" style={{ height: 320 }}>
              <DailyTrendChart daily={data.daily} />
            </div>
          </div>
        </section>

        {/* By channel table */}
        <section className="section">
          <div className="section-head">
            <div className="section-label">Channels</div>
            <h2>By Channel · {rangeDays} days</h2>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Channel</th><th>Sessions</th><th>Users</th><th>Bounce</th><th>Avg Duration</th><th>Engagement</th><th>Quality</th></tr>
              </thead>
              <tbody>
                {data.channel.map((r) => {
                  const q = qLabel(qScore(r));
                  return (
                    <tr key={r.name}>
                      <td><span className="dot" style={{ background: colorFor(r.name) }} />{r.name}</td>
                      <td>{fmtNum(r.sessions)}</td>
                      <td>{fmtNum(r.users)}</td>
                      <td>{pct(r.bounce)}</td>
                      <td>{fmtDur(r.duration)}</td>
                      <td>{pct(r.engagement)}</td>
                      <td className={q.cls}>{q.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Channel comparison */}
        <section className="section">
          <div className="section-head">
            <div className="section-label">Comparison</div>
            <h2>Channel Comparison · top {topChannels.length}</h2>
          </div>
          <div className="chart-grid">
            <div className="chart-card"><div className="chart-box"><ChannelBarChart rows={topChannels} metric="bounce" label="Bounce Rate %" asPercent /></div></div>
            <div className="chart-card"><div className="chart-box"><ChannelBarChart rows={topChannels} metric="duration" label="Avg Duration (s)" /></div></div>
            <div className="chart-card"><div className="chart-box"><ChannelBarChart rows={topChannels} metric="engagement" label="Engagement %" asPercent /></div></div>
          </div>
        </section>

        {/* Yesterday by channel */}
        <section className="section">
          <div className="section-head">
            <div className="section-label">Yesterday detail</div>
            <h2>Yesterday by Channel</h2>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Channel</th><th>Sessions</th><th>7-day avg/day</th><th>Bounce</th><th>Duration</th></tr>
              </thead>
              <tbody>
                {data.yesterday.map((r) => {
                  const w = wkMap.get(r.name);
                  const avgSess = w ? w.sessions / 7 : null;
                  const sp = avgSess ? trendPill(r.sessions, avgSess, true) : null;
                  return (
                    <tr key={r.name}>
                      <td><span className="dot" style={{ background: colorFor(r.name) }} />{r.name}</td>
                      <td>{fmtNum(r.sessions)} {sp && <span className={`trend-pill ${sp.cls}`}>{sp.text}</span>}</td>
                      <td style={{ opacity: 0.55 }}>{avgSess != null ? `${fmtNum(avgSess)}/day` : "—"}</td>
                      <td>{pct(r.bounce)}</td>
                      <td>{fmtDur(r.duration)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Insights */}
        <section className="section">
          <div className="section-head">
            <div className="section-label">Takeaways</div>
            <h2>Key Insights</h2>
          </div>
          {insights.map((i, n) => (
            <div className="callout" key={n}>
              <span className="insight-tag">{i.tag}</span>
              <div>{i.text}</div>
            </div>
          ))}
        </section>

        <footer className="footer">
          <span>Last updated {new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
          <span className="footer-sep">·</span>
          <span>Source: GA4 via Windsor.ai</span>
        </footer>
      </main>
    </>
  );
}
