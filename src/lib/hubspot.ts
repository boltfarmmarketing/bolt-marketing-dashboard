/**
 * HubSpot connector (Private App token).
 *
 * Counts qualified leads created within a date window via the CRM search API.
 * "Qualified" is defined by lifecyclestage — adjust QUALIFIED_STAGES to match
 * how Bolt Farm marks a lead qualified in HubSpot.
 */
const QUALIFIED_STAGES = ["marketingqualifiedlead", "salesqualifiedlead", "opportunity", "customer"];

function requireToken(): string {
  const t = process.env.HUBSPOT_TOKEN;
  if (!t) throw new Error("HUBSPOT_TOKEN is not set");
  return t;
}

/** Count contacts that became qualified leads within [from, to] (inclusive ISO dates). */
export async function fetchQualifiedLeads(from: string, to: string): Promise<number> {
  const fromMs = new Date(from + "T00:00:00Z").getTime();
  const toMs = new Date(to + "T23:59:59Z").getTime();

  const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireToken()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            { propertyName: "createdate", operator: "BETWEEN", value: String(fromMs), highValue: String(toMs) },
            { propertyName: "lifecyclestage", operator: "IN", values: QUALIFIED_STAGES },
          ],
        },
      ],
      limit: 1,
    }),
  });

  if (!res.ok) throw new Error(`HubSpot search → HTTP ${res.status}`);
  const json = (await res.json()) as { total?: number };
  return json.total ?? 0;
}
