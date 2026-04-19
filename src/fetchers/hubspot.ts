import 'dotenv/config';

// Direct HubSpot REST API client. Pulls from the Leads object.
// Docs: https://developers.hubspot.com/docs/api/crm/leads
//
// "Qualified lead" = a lead created in HUBSPOT_PIPELINE_NAME during the
// window, NOT owned by any owner listed in HUBSPOT_EXCLUDED_OWNER_NAMES.
// (Bolt Coaching leads are filtered out per business rule.)

const BASE = 'https://api.hubapi.com';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function hubspotFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = requireEnv('HUBSPOT_ACCESS_TOKEN');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot ${path} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ── Pipelines ───────────────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  label: string;
  displayOrder: number;
}

export interface Pipeline {
  id: string;
  label: string;
  stages: PipelineStage[];
}

interface PipelinesResponse {
  results: Pipeline[];
}

export async function listLeadPipelines(): Promise<Pipeline[]> {
  const res = await hubspotFetch<PipelinesResponse>('/crm/v3/pipelines/leads');
  return res.results;
}

export async function resolveLeadPipelineByName(name: string): Promise<Pipeline> {
  const pipelines = await listLeadPipelines();
  const match = pipelines.find((p) => p.label.toLowerCase() === name.toLowerCase());
  if (!match) {
    const available = pipelines.map((p) => `"${p.label}"`).join(', ');
    throw new Error(`HubSpot lead pipeline "${name}" not found. Available: ${available}`);
  }
  return match;
}

// ── Owners ──────────────────────────────────────────────────────────────

export interface HubSpotOwner {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  userId?: number;
  teams?: { id: string; name: string; primary?: boolean }[];
}

interface OwnersResponse {
  results: HubSpotOwner[];
  paging?: { next?: { after: string } };
}

export async function listOwners(): Promise<HubSpotOwner[]> {
  const owners: HubSpotOwner[] = [];
  let after: string | undefined;
  do {
    const query = after ? `?after=${encodeURIComponent(after)}&limit=100` : '?limit=100';
    const page = await hubspotFetch<OwnersResponse>(`/crm/v3/owners${query}`);
    owners.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);
  return owners;
}

function ownerLabel(o: HubSpotOwner): string {
  const name = [o.firstName, o.lastName].filter(Boolean).join(' ').trim();
  return name || o.email || `(id:${o.id})`;
}

export async function resolveOwnerIdsByName(names: string[]): Promise<{ id: string; label: string }[]> {
  if (names.length === 0) return [];
  const owners = await listOwners();
  const needle = new Set(names.map((n) => n.toLowerCase()));

  const matched = owners.filter((o) => {
    const label = ownerLabel(o).toLowerCase();
    const email = (o.email || '').toLowerCase();
    const teamNames = (o.teams || []).map((t) => t.name.toLowerCase());
    return (
      needle.has(label) ||
      needle.has(email) ||
      teamNames.some((t) => needle.has(t))
    );
  });

  if (matched.length === 0) {
    throw new Error(
      `No HubSpot owner matched names: ${names.join(', ')}. ` +
        `Checked owner name, email, and team name. Run the fetch-hubspot script to see the full owner list.`,
    );
  }
  return matched.map((o) => ({ id: o.id, label: ownerLabel(o) }));
}

// ── Leads ───────────────────────────────────────────────────────────────

export interface HubSpotLead {
  id: string;
  properties: {
    hs_lead_name?: string;
    hs_pipeline?: string;
    hs_pipeline_stage?: string;
    hs_lead_status?: string;
    hubspot_owner_id?: string;
    hs_createdate?: string;
  };
}

interface LeadSearchResponse {
  total: number;
  results: HubSpotLead[];
  paging?: { next?: { after: string } };
}

type Filter =
  | { propertyName: string; operator: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'HAS_PROPERTY' | 'NOT_HAS_PROPERTY'; value: string }
  | { propertyName: string; operator: 'IN' | 'NOT_IN'; values: string[] };

function toEpochMs(isoDate: string, endOfDay = false): string {
  const d = new Date(isoDate + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
  return String(d.getTime());
}

export async function fetchLeadsCreatedInWindow(
  pipelineId: string,
  dateFrom: string,
  dateTo: string,
  opts: { stageId?: string; excludeOwnerIds?: string[] } = {},
): Promise<HubSpotLead[]> {
  const leads: HubSpotLead[] = [];
  let after: string | undefined;

  const filters: Filter[] = [
    { propertyName: 'hs_pipeline', operator: 'EQ', value: pipelineId },
    { propertyName: 'hs_createdate', operator: 'GTE', value: toEpochMs(dateFrom) },
    { propertyName: 'hs_createdate', operator: 'LTE', value: toEpochMs(dateTo, true) },
  ];
  if (opts.stageId) {
    filters.push({ propertyName: 'hs_pipeline_stage', operator: 'EQ', value: opts.stageId });
  }
  if (opts.excludeOwnerIds && opts.excludeOwnerIds.length > 0) {
    filters.push({ propertyName: 'hubspot_owner_id', operator: 'NOT_IN', values: opts.excludeOwnerIds });
  }

  do {
    const body = {
      filterGroups: [{ filters }],
      properties: ['hs_lead_name', 'hs_pipeline', 'hs_pipeline_stage', 'hs_lead_status', 'hubspot_owner_id', 'hs_createdate'],
      limit: 100,
      ...(after ? { after } : {}),
    };

    const page = await hubspotFetch<LeadSearchResponse>(
      '/crm/v3/objects/leads/search',
      { method: 'POST', body: JSON.stringify(body) },
    );
    leads.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);

  return leads;
}

// ── Top-level: qualified leads for a window ─────────────────────────────

export interface HubSpotQualifiedLeads {
  pipelineName: string;
  pipelineId: string;
  stageName?: string;
  stageId?: string;
  excludedOwners: { id: string; label: string }[];
  count: number;
  leads: HubSpotLead[];
}

export async function fetchHubSpotQualifiedLeads(
  dateFrom: string,
  dateTo: string,
): Promise<HubSpotQualifiedLeads> {
  const pipelineName = process.env.HUBSPOT_PIPELINE_NAME || 'Lead pipeline';
  const pipeline = await resolveLeadPipelineByName(pipelineName);

  const stageLabel = process.env.HUBSPOT_QUALIFIED_STAGE;
  let stageId: string | undefined;
  let stageName: string | undefined;
  if (stageLabel) {
    const stage = pipeline.stages.find((s) => s.label.toLowerCase() === stageLabel.toLowerCase());
    if (!stage) {
      const available = pipeline.stages.map((s) => `"${s.label}"`).join(', ');
      throw new Error(`Stage "${stageLabel}" not in "${pipelineName}". Available: ${available}`);
    }
    stageId = stage.id;
    stageName = stage.label;
  }

  const excludedNames = (process.env.HUBSPOT_EXCLUDED_OWNER_NAMES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const excludedOwners = await resolveOwnerIdsByName(excludedNames);

  const leads = await fetchLeadsCreatedInWindow(pipeline.id, dateFrom, dateTo, {
    stageId,
    excludeOwnerIds: excludedOwners.map((o) => o.id),
  });

  return {
    pipelineName: pipeline.label,
    pipelineId: pipeline.id,
    stageName,
    stageId,
    excludedOwners,
    count: leads.length,
    leads,
  };
}
