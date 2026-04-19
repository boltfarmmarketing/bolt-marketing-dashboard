# Olive — weekly bookings (manual entry)

Olive has no API, so bookings are typed by hand each Monday into `weeks.json`.

## How to add a week

Duplicate the most recent entry in the `weeks` array, bump `weekOf` forward 7 days, and fill in 5 numbers:

```json
{
  "weekOf": "2026-04-20",
  "bookings": {
    "googleAds": 5,
    "metaAds":   2,
    "organic":   3,
    "direct":    1
  },
  "avgBookingValue": 2100
}
```

## What the numbers mean

- `weekOf` — Monday of the week, `YYYY-MM-DD`.
- `bookings.<source>` — reservations from that source (integer, ≥ 0). All four sources required; use `0` if none.
- `avgBookingValue` — average booking revenue in USD. Total weekly revenue is derived as `avgBookingValue × sum(bookings)`.
- `notes` — optional.

## Why avg instead of total

Olive shows bookings per source but not revenue per source. Entering one average lets the dashboard pro-rate revenue across sources for the per-source sub-lines. If average booking value is stable week-to-week, you can leave it the same and just update counts.

## Validate before committing

```
npm run olive:check
```

Prints every parsed week with `count × avg = revenue` so you can eyeball it.

## How it's used

- Latest entry drives current-week numbers on the dashboard.
- All entries populate 8-week sparklines.
- Same week from 52 weeks back populates YoY — starts working after a year of entries.
