import { readOliveFile, totalBookings, totalRevenue } from '../fetchers/olive.js';

async function main() {
  const { weeks } = await readOliveFile();
  console.log(`✓ ${weeks.length} week(s) parsed cleanly\n`);
  for (const w of weeks) {
    const count = totalBookings(w);
    const rev = totalRevenue(w);
    const notes = w.notes ? ` — ${w.notes}` : '';
    console.log(`  ${w.weekOf}  ${count} bookings × $${w.avgBookingValue.toLocaleString()} avg = $${rev.toLocaleString()}${notes}`);
  }
}

main().catch((err) => {
  console.error('✗ ' + (err instanceof Error ? err.message : err));
  process.exit(1);
});
