// Multilingual sentence embeddings, computed locally on CPU with transformers.js (ONNX): no API, no key,
// no quota. Used to group the same story across outlets and languages and to help the classifier.
// transformers.js is an optional dependency: if it is missing, or the model does not load in time, the
// caller gets null and falls back to the keyword algorithms.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from './text.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE_DIR = resolve(ROOT, '.cache');
const VECTOR_CACHE = resolve(CACHE_DIR, 'embeddings.json');

// Candidates compared by scripts/eval/cluster-eval.js. Each model wants its own prefix (e5: "query: " on
// both sides for symmetric tasks such as clustering; EmbeddingGemma: a task prompt); `dims` truncates
// Matryoshka models (then re-normalised); `link` is the story threshold for cluster.js, calibrated on the
// labelled pairs. Paraphrase-MiniLM won: the best F1, and e5 scores Spanish–English pairs much lower
// than same-language ones, so it barely groups across languages.
export const MODELS = {
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2': { dtype: 'q8', prefix: '', link: 0.66 },
  'Xenova/multilingual-e5-small': { dtype: 'q8', prefix: 'query: ', link: 1 },
  'onnx-community/embeddinggemma-300m-ONNX': { dtype: 'q4', prefix: 'task: clustering | query: ', gemma: true, dims: 256, link: 0.82 },
};
export const DEFAULT_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BATCH = 32;

export function normalizeVec(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// int8 + base64: 384 dims → 512 characters. Scaled by the largest component; the scale is not stored
// because cosine similarity does not depend on it (the reader normalises).
export function toInt8B64(v) {
  let max = 0;
  for (const x of v) max = Math.max(max, Math.abs(x));
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = max ? Math.round((v[i] / max) * 127) : 0;
  return Buffer.from(q.buffer).toString('base64');
}

export function fromInt8B64(s) {
  const b = Buffer.from(s, 'base64');
  return normalizeVec(new Int8Array(b.buffer, b.byteOffset, b.length));
}

// Title plus feed excerpt (already cut to 240 characters by parse.js).
export const articleText = (a) => [a.title, a.summary].filter(Boolean).join('. ');

const withTimeout = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: más de ${ms / 1000} s`)), ms).unref())]);

// → { id, dims, link, embed(texts) → Float32Array[] } or null (with a warning) if it cannot be used.
export async function loadEmbedder({ model = process.env.EMBED_MODEL || DEFAULT_MODEL, cacheDir = resolve(CACHE_DIR, 'models'), timeoutMs = 120_000 } = {}) {
  const spec = MODELS[model] ?? { dtype: 'q8', prefix: '' };
  try {
    const tf = await import('@huggingface/transformers');
    tf.env.cacheDir = cacheDir;
    tf.env.allowLocalModels = false;
    let run;
    if (spec.gemma) {
      const [tokenizer, net] = await withTimeout(
        Promise.all([tf.AutoTokenizer.from_pretrained(model), tf.AutoModel.from_pretrained(model, { dtype: spec.dtype })]),
        timeoutMs,
        'carga del modelo',
      );
      run = async (texts) => {
        const { sentence_embedding: e } = await net(await tokenizer(texts, { padding: true, truncation: true, max_length: 256 }));
        const [n, d] = e.dims;
        return Array.from({ length: n }, (_, i) => normalizeVec(e.data.subarray(i * d, i * d + (spec.dims ?? d))));
      };
    } else {
      const extractor = await withTimeout(tf.pipeline('feature-extraction', model, { dtype: spec.dtype }), timeoutMs, 'carga del modelo');
      run = async (texts) => {
        const e = await extractor(texts, { pooling: 'mean', normalize: true });
        const [n, d] = e.dims;
        return Array.from({ length: n }, (_, i) => Float32Array.from(e.data.subarray(i * d, (i + 1) * d)));
      };
    }
    const embed = async (texts) => {
      const out = [];
      for (let i = 0; i < texts.length; i += BATCH) out.push(...(await run(texts.slice(i, i + BATCH).map((t) => spec.prefix + t))));
      return out;
    };
    const [probe] = await embed(['prueba']);
    return { id: model, dims: probe.length, link: spec.link ?? 0.7, embed };
  } catch (err) {
    console.warn(`⚠ Embeddings no disponibles (${model}): ${String(err?.message ?? err).slice(0, 300)}. Se usa la agrupación por palabras.`);
    return null;
  }
}

async function readCache(file, model) {
  try {
    const c = JSON.parse(await readFile(file, 'utf8'));
    return c.model === model ? c.vectors ?? {} : {};
  } catch {
    return {};
  }
}

// Vectors for every article, from the cache (.cache/embeddings.json, kept between runs by the
// workflow) when the text has not changed; only new articles go through the model. The cache keeps
// just this run's articles. Throws if embedding runs past `budgetMs`, so the caller can fall back.
export async function embedArticles(articles, embedder, { cache = true, cacheFile = VECTOR_CACHE, budgetMs = 150_000 } = {}) {
  const stored = cache ? await readCache(cacheFile, embedder.id) : {};
  const vectors = new Map();
  const todo = [];
  for (const a of articles) {
    const h = hash(articleText(a));
    const hit = stored[a.id];
    if (hit?.h === h) vectors.set(a.id, fromInt8B64(hit.v));
    else todo.push({ a, h });
  }
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += BATCH * 4) {
    if (Date.now() - t0 > budgetMs) throw new Error(`embeddings: más de ${budgetMs / 1000} s`);
    const chunk = todo.slice(i, i + BATCH * 4);
    const vecs = await embedder.embed(chunk.map(({ a }) => articleText(a)));
    chunk.forEach(({ a }, j) => vectors.set(a.id, vecs[j]));
  }
  if (cache) {
    const next = {};
    for (const a of articles) {
      const v = vectors.get(a.id);
      next[a.id] = { h: hash(articleText(a)), v: toInt8B64(v) };
    }
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ model: embedder.id, vectors: next }));
  }
  return { vectors, computed: todo.length, cached: articles.length - todo.length };
}
