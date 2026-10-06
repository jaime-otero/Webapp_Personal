// How old is the published edition? Used by the workflows (no dependencies):
//   node scripts/ci/freshness.js <https://…/data/meta.json | path/to/news.json> <max minutes>
// Prints the age and exits 0 if the edition is younger than the limit, 1 if older, 2 if it
// cannot be read (missing file, site down, invalid JSON).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function ageMinutes(generatedAt, now = Date.now()) {
  const t = Date.parse(generatedAt);
  return Number.isNaN(t) ? null : (now - t) / 60e3;
}

async function load(source, attempts = 3) {
  if (!/^https?:\/\//.test(source)) return JSON.parse(await readFile(source, 'utf8'));
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(source, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastError;
}

async function main() {
  const [source, max] = process.argv.slice(2);
  const limit = Number(max);
  if (!source || !(limit > 0)) {
    console.error('uso: freshness.js <url|archivo> <minutos>');
    process.exit(2);
  }
  let age;
  try {
    age = ageMinutes((await load(source)).generatedAt);
  } catch (err) {
    console.log(`no se pudo leer ${source}: ${err.message}`);
    process.exit(2);
  }
  if (age === null) {
    console.log(`${source} no tiene un generatedAt válido`);
    process.exit(2);
  }
  console.log(`edición de hace ${Math.round(age)} min (límite ${limit})`);
  process.exit(age < limit ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
