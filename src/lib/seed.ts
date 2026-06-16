// Static imports so the seed snapshots are bundled into the serverless output.
import indexJson from "@/data/seed/weeks/index.json";
import w0302 from "@/data/seed/weeks/2026-03-02.json";
import w0309 from "@/data/seed/weeks/2026-03-09.json";
import w0316 from "@/data/seed/weeks/2026-03-16.json";
import w0323 from "@/data/seed/weeks/2026-03-23.json";
import w0330 from "@/data/seed/weeks/2026-03-30.json";
import w0406 from "@/data/seed/weeks/2026-04-06.json";
import w0413 from "@/data/seed/weeks/2026-04-13.json";
import w0420 from "@/data/seed/weeks/2026-04-20.json";
import w0427 from "@/data/seed/weeks/2026-04-27.json";
import w0504 from "@/data/seed/weeks/2026-05-04.json";
import trafficJson from "@/data/seed/traffic.json";

import type { TrafficData, WeekData, WeekIndex } from "./types";

export const seedIndex = indexJson as WeekIndex;

export const seedWeeks: Record<string, WeekData> = {
  "2026-03-02": w0302 as WeekData,
  "2026-03-09": w0309 as WeekData,
  "2026-03-16": w0316 as WeekData,
  "2026-03-23": w0323 as WeekData,
  "2026-03-30": w0330 as WeekData,
  "2026-04-06": w0406 as WeekData,
  "2026-04-13": w0413 as WeekData,
  "2026-04-20": w0420 as WeekData,
  "2026-04-27": w0427 as WeekData,
  "2026-05-04": w0504 as WeekData,
};

export const seedTraffic = trafficJson as TrafficData;
