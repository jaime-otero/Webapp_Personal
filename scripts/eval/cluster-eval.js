// Evaluates story grouping on hand-labelled pairs of real headlines (pairs.json): for each embedding
// model, pairwise precision / recall / F1 of plain cosine and of the hybrid score of cluster.js over a
// range of thresholds, the threshold picked with 2-fold cross-validation, the Spanish–English subset,
// and what the full clustering (cluster.js) and the old word-overlap algorithm do with the same articles.
//
//   npm run eval:cluster                      # every model in embed.js MODELS
//   npm run eval:cluster -- Xenova/multilingual-e5-small
//
// Pairs come from a stratified sample, so every count is weighted by its stratum (w).

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, loadEmbedder, articleText, dot } from '../ingest/embed.js';
import { clusterArticles, features, pairScore } from '../ingest/cluster.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const { pairs: all } = JSON.parse(await readFile(resolve(HERE, 'pairs.json'), 'utf8'));
const pairs = all.filter((p) => p.same !== null);
const articles = [...new Map(all.flatMap((p) => [p.a, p.b]).map((a) => [a.id, { ...a, sections: [], image: null, sourceId: a.source }])).values()];
const feats = new Map(articles.map((a) => [a.id, features(a)]));
const cross = (p) => p.a.lang !== p.b.lang;

function prf(subset, predict) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const p of subset) {
    const yes = predict(p);
    if (yes && p.same) tp += p.w;
    else if (yes) fp += p.w;
    else if (p.same) fn += p.w;
  }
  const P = tp / (tp + fp || 1);
  const R = tp / (tp + fn || 1);
  return { P, R, F: (2 * P * R) / (P + R || 1) };
}

const fmt = ({ P, R, F }) => `P ${P.toFixed(2)}  R ${R.toFixed(2)}  F1 ${F.toFixed(3)}`;
const thresholds = Array.from({ length: 81 }, (_, i) => +(0.3 + i * 0.01).toFixed(2));
const bestThreshold = (subset, score) => thresholds.map((t) => ({ t, ...prf(subset, (p) => score(p) >= t) })).sort((a, b) => b.F - a.F)[0];

console.log(`${pairs.length} pares etiquetados (${pairs.filter((p) => p.same).length} mismo suceso, ${pairs.filter(cross).length} ES↔EN), ${articles.length} artículos\n`);

// Old algorithm: word overlap, same language only.
const lexical = clusterArticles(articles);
const lexStory = new Map(lexical.flatMap((s, i) => s.articleIds.map((id) => [id, i])));
const sameLex = (p) => lexStory.get(p.a.id) === lexStory.get(p.b.id);
console.log(`Palabras (algoritmo anterior)   ${fmt(prf(pairs, sameLex))}   ES↔EN ${fmt(prf(pairs.filter(cross), sameLex))}\n`);

for (const model of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MODELS)) {
  const t0 = Date.now();
  const embedder = await loadEmbedder({ model, timeoutMs: 900_000 });
  if (!embedder) continue;
  const t1 = Date.now();
  const vecs = await embedder.embed(articles.map(articleText));
  const t2 = Date.now();
  const vectors = new Map(articles.map((a, i) => [a.id, vecs[i]]));
  const cos = (p) => dot(vectors.get(p.a.id), vectors.get(p.b.id));
  const hybrid = (p) => pairScore(cos(p), feats.get(p.a.id), feats.get(p.b.id));

  console.log(`== ${model} (${embedder.dims} dims; carga ${((t1 - t0) / 1000).toFixed(1)} s, ${((t2 - t1) / articles.length).toFixed(1)} ms/artículo)`);
  const c = bestThreshold(pairs, cos);
  const h = bestThreshold(pairs, hybrid);
  console.log(`  coseno      mejor umbral ${c.t.toFixed(2)}  ${fmt(c)}`);
  console.log(`  híbrido     mejor umbral ${h.t.toFixed(2)}  ${fmt(h)}`);
  // 2-fold cross-validation: pick the threshold on one half, measure on the other.
  const halves = [pairs.filter((_, i) => i % 2 === 0), pairs.filter((_, i) => i % 2 === 1)];
  const cv = halves.map((train, k) => {
    const { t } = bestThreshold(train, hybrid);
    return { t, ...prf(halves[1 - k], (p) => hybrid(p) >= t) };
  });
  console.log(`  híbrido CV  umbrales ${cv.map((x) => x.t.toFixed(2)).join(' / ')}  ${cv.map(fmt).join('  |  ')}`);
  const link = MODELS[model]?.link ?? h.t;
  console.log(`  híbrido con link=${link}  ${fmt(prf(pairs, (p) => hybrid(p) >= link))}   ES↔EN ${fmt(prf(pairs.filter(cross), (p) => hybrid(p) >= link))}`);
  // The full clustering (average linkage) is stricter than single pairs: sweep its threshold.
  const grouped = (l) => {
    const stories = clusterArticles(articles, { vectors, link: l });
    const storyOf = new Map(stories.flatMap((s, i) => s.articleIds.map((id) => [id, i])));
    const together = (p) => storyOf.get(p.a.id) === storyOf.get(p.b.id);
    return { l, stories, all: prf(pairs, together), es: prf(pairs.filter(cross), together) };
  };
  const sweep = thresholds.filter((t) => Math.abs(t - link) <= 0.12 + 1e-9 && (Math.round(t * 100) % 2 === 0 || t === link)).map(grouped);
  for (const g of sweep) console.log(`  agrupación link=${g.l.toFixed(2)}${g.l === link ? '*' : ' '} ${fmt(g.all)}   ES↔EN ${fmt(g.es)}`);
  const chosen = sweep.find((g) => g.l === link) ?? grouped(link);
  const sizes = chosen.stories.map((s) => s.sources.length).sort((a, b) => b - a);
  console.log(`  (* = link del modelo) ${chosen.stories.length} noticias, ${chosen.stories.filter((s) => s.langs.length > 1).length} con ES y EN, mayores: ${sizes.slice(0, 5).join(', ')}\n`);
}
