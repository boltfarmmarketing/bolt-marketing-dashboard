# Bolt Farm Marketing Dashboard

Weekly marketing KPI dashboard for Bolt Farm Treehouse leadership. Seven core metrics (plus ROAS) pulled from HubSpot, GA4, Google Ads, Meta, and Olive, refreshed weekly, displayed on a branded static site hosted on Netlify.

## Status

Step 1 (scaffold) and step 2 (static dashboard against mock data) are the current focus. Live data wiring comes in steps 3–7.

## How it refreshes

1. You drop the Olive weekly bookings CSV into `data/olive/YYYY-MM-DD.csv` and commit.
2. The push triggers `.github/workflows/weekly-refresh.yml`.
3. The Action runs the Node orchestrator: Windsor.ai pulls Google Ads / Meta / GA4 / HubSpot, the CSV parser reads the newest Olive file, `aggregate.ts` computes deltas and source breakdowns, the result is written to `public/data.json`.
4. The Action commits `public/data.json` back to the repo.
5. Netlify auto-deploys from `public/`.

No cron — refresh is push-driven off the Olive CSV drop. Manual run available via GitHub Actions "Run workflow".

## Local dev

```
npm install
npm run typecheck
```

The static site is `public/index.html` — open it directly in a browser, no build step.

### Windsor.ai testing (step 3)

Once `WINDSOR_API_KEY` and the per-source account IDs are in `.env`:

```
npm run windsor:discover   # Lists available fields per connector — run first, confirm field names match src/fetchers/windsor.ts
npm run windsor:fetch      # Pulls last 7 days from all 4 sources, dumps a sample row
```

Adjust the `fields:` arrays in `src/fetchers/windsor.ts` if `discover` reveals different names for your account (especially likely for GA4 and HubSpot).

## Environment

See `.env.example`. Secrets live in GitHub Actions → Settings → Secrets → Actions, not in the repo.

## File layout

```
.github/workflows/weekly-refresh.yml   Push-driven refresh job
src/
  fetchers/windsor.ts                  Windsor.ai API client
  fetchers/olive.ts                    CSV parser for data/olive/ (step 4)
  bin/discover-windsor.ts              CLI — lists Windsor fields per connector
  bin/fetch-windsor.ts                 CLI — pulls last 7d, dumps sample rows
  aggregate.ts                         Derives rates, deltas, source splits (step 5)
  index.ts                             Orchestrator
  types.ts                             Dashboard data schema
public/
  index.html  styles.css  main.js  sparkline.js
  data.json                            Committed by the Action each week
data/olive/                            You drop weekly CSVs here
```
