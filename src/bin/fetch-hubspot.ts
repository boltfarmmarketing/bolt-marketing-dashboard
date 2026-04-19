import 'dotenv/config';
import {
  listLeadPipelines,
  listOwners,
  fetchHubSpotQualifiedLeads,
} from '../fetchers/hubspot.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('── Lead pipelines + stages ──');
  const pipelines = await listLeadPipelines();
  for (const p of pipelines) {
    console.log(`\n  ${p.label} (id=${p.id})`);
    const sorted = [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder);
    for (const s of sorted) {
      console.log(`    ${s.displayOrder.toString().padStart(2)}. ${s.label}  (id=${s.id})`);
    }
  }

  console.log('\n── Owners ──');
  const owners = await listOwners();
  for (const o of owners) {
    const name = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || '(no name)';
    const teams = (o.teams || []).map((t) => t.name).join(', ');
    console.log(`  ${name}  ${o.email || ''}${teams ? '  [teams: ' + teams + ']' : ''}  (id=${o.id})`);
  }

  const dateTo = daysAgo(1);
  const dateFrom = daysAgo(30);
  console.log(`\n── Qualified leads ${dateFrom} → ${dateTo} ──`);
  const result = await fetchHubSpotQualifiedLeads(dateFrom, dateTo);
  console.log(`  pipeline: ${result.pipelineName}`);
  if (result.stageName) console.log(`  stage filter: "${result.stageName}"`);
  console.log(`  excluding owners: ${result.excludedOwners.map((o) => `"${o.label}"`).join(', ') || '(none)'}`);
  console.log(`  count: ${result.count}`);
  if (result.leads.length > 0) {
    const first = result.leads[0];
    if (first) console.log('  first lead: ' + JSON.stringify(first).slice(0, 400));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
