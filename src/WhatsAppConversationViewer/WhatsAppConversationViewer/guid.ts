const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids end up in Web API URLs and OData filters. Accept nothing but a real GUID
// (with or without braces), so a malformed or forged id can't change the query.
export function normalizeGuid(value: string | undefined): string {
    const candidate = (value ?? "").replace(/[{}]/g, "").trim();
    return GUID.test(candidate) ? candidate.toLowerCase() : "";
}
