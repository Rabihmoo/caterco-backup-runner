// Freshness check for the encrypted backup store. Reads only KEY NAMES from one Cloudflare KV namespace (never values, never the database).
// Exit 0 when the newest COMPLETE backup (a dump file and a manifest file with the same timestamp) is younger than MAX_AGE_HOURS; otherwise exit 1.
// Environment: CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN, DB_NAME (the database name used as the file prefix). Prints only fixed status lines.
const { CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN, DB_NAME } = process.env;
const MAX_AGE_HOURS = 36;
const fail = (m) => {
  console.error(`kv-freshness: ${m}`);
  process.exit(1);
};
if (!CF_ACCOUNT_ID || !CF_KV_NAMESPACE_ID || !CF_API_TOKEN || !DB_NAME) fail("configuration missing");
if (!/^[A-Za-z0-9_]{1,63}$/.test(DB_NAME)) fail("invalid database name");

const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/keys`;
const names = [];
let cursor = "";
for (let page = 0; page < 20; page++) {
  const url = `${base}?limit=1000&prefix=${encodeURIComponent(`${DB_NAME}-`)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${CF_API_TOKEN}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) fail(`key listing refused (HTTP ${res.status})`);
  const j = await res.json();
  for (const k of j.result ?? []) names.push(k.name);
  cursor = j.result_info?.cursor ?? "";
  if (!cursor) break;
}

const stamps = new Map();
for (const n of names) {
  const m = new RegExp(`^${DB_NAME}-(\\d{8}T\\d{6}Z)\\.(dump|manifest)\\.enc$`).exec(n);
  if (m) stamps.set(m[1], (stamps.get(m[1]) ?? new Set()).add(m[2]));
}
const complete = [...stamps].filter(([, kinds]) => kinds.has("dump") && kinds.has("manifest")).map(([s]) => s).sort();
if (complete.length === 0) fail("no complete backup found");
const s = complete.at(-1);
const at = Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`);
const ageH = (Date.now() - at) / 3_600_000;
if (!(ageH >= -0.1 && ageH <= MAX_AGE_HOURS)) fail(`newest complete backup is ${ageH.toFixed(1)} h old (limit ${MAX_AGE_HOURS} h)`);
console.log(`kv-freshness: ok, newest complete backup ${ageH.toFixed(1)} h old, ${complete.length} complete backup(s) kept`);
