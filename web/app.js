import { TOPICS, loadProfile, saveProfile, pruneProfile, defaultProfile } from './lib/profile.js';
import { rankStories, learn } from './lib/rank.js';

const PAGE = 30;
const state = { data: null, profile: pruneProfile(loadProfile()), view: 'foryou', limit: PAGE };
const $main = document.getElementById('main');
const $tabs = document.getElementById('tabs');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u ?? '') ? u : '#');
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.parse(iso) - Date.now()) / 6e4);
  if (mins > -60) return rtf.format(Math.min(mins, 0), 'minute');
  if (mins > -1440) return rtf.format(Math.round(mins / 60), 'hour');
  return rtf.format(Math.round(mins / 1440), 'day');
}

function persist() {
  saveProfile(state.profile);
}

// ---------- data ----------

async function loadData() {
  try {
    const res = await fetch('data/news.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
  } catch {
    $main.innerHTML = `<div class="empty"><p>No se han podido cargar las noticias.</p><p class="muted">Comprueba la conexión o vuelve a intentarlo en un rato.</p></div>`;
    return;
  }
  document.getElementById('updated').textContent = `Actualizado ${timeAgo(state.data.generatedAt)}`;
  render();
  if (!state.profile.onboarded) openOnboarding();
}

const findStory = (id) => state.data?.stories.find((s) => s.id === id) ?? state.profile.saved[id];

// ---------- views ----------

function tabsHtml() {
  const tabs = [['foryou', 'Para ti'], ['briefing', 'Resumen IA']];
  for (const [t, label] of Object.entries(TOPICS)) if ((state.profile.topics[t] ?? 1) > -2) tabs.push([`topic:${t}`, label]);
  tabs.push(['saved', 'Guardados'], ['settings', 'Ajustes']);
  return tabs
    .map(([v, label]) => `<button class="tab${state.view === v ? ' active' : ''}" data-view="${v}" ${state.view === v ? 'aria-current="page"' : ''}>${esc(label)}</button>`)
    .join('');
}

function storyCard(story) {
  const p = state.profile;
  const [first, ...rest] = story.sources;
  const read = p.read[story.id] ? ' read' : '';
  const saved = !!p.saved[story.id];
  const text = story.aiSummary
    ? `<p class="summary"><span class="badge" title="Resumen generado con IA a partir de los titulares y extractos de los medios">IA</span> ${esc(story.aiSummary)}</p>`
    : story.summary
      ? `<p class="summary">${esc(story.summary)}</p>`
      : '';
  const topics = story.topics.filter((t) => TOPICS[t] && t !== 'espana').slice(0, 3).map((t) => `<span class="chip">${TOPICS[t]}</span>`).join('');
  const others = rest.length
    ? `<details class="others"><summary>${rest.length === 1 ? 'También en 1 medio más' : `También en ${rest.length} medios más`}</summary><ul>${rest
        .map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" data-open="${story.id}"><strong>${esc(s.source)}</strong> · ${esc(s.title)}</a></li>`)
        .join('')}</ul></details>`
    : '';
  return `<article class="card${read}" data-id="${story.id}">
    ${story.image ? `<img class="thumb" src="${esc(safeUrl(story.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="body">
      <p class="meta"><strong>${esc(first.source)}</strong>${rest.length ? ` <span class="coverage">+${rest.length}</span>` : ''} · ${timeAgo(story.publishedAt)} ${topics}</p>
      <h2><a href="${esc(safeUrl(first.url))}" target="_blank" rel="noopener" data-open="${story.id}">${esc(story.title)}</a></h2>
      ${text}
      ${others}
      <div class="actions">
        <button data-act="like" title="Más noticias como esta">👍 Más así</button>
        <button data-act="dislike" title="Menos noticias como esta">👎 Menos</button>
        <button data-act="save" aria-pressed="${saved}">${saved ? '★ Guardada' : '☆ Guardar'}</button>
        <button data-act="hide" title="Ocultar esta noticia">Ocultar</button>
      </div>
    </div>
  </article>`;
}

function listHtml(stories, emptyMsg) {
  if (!stories.length) return `<div class="empty"><p>${emptyMsg}</p></div>`;
  const page = stories.slice(0, state.limit);
  return `<div class="list">${page.map(storyCard).join('')}</div>${stories.length > page.length ? `<button class="more" data-act="more">Ver más</button>` : ''}`;
}

function briefingHtml() {
  const b = state.data.briefing;
  const top = rankStories(state.data.stories.filter((s) => s.aiSummary), state.profile).slice(0, 12);
  const intro = b
    ? `<section class="briefing"><h2>Lo importante ahora</h2><p>${esc(b.text)}</p><p class="muted small">Generado con IA ${timeAgo(b.at)} a partir de titulares de ${state.data.sources.filter((s) => s.ok).length} medios. Puede contener errores: abre las fuentes para contrastar.</p></section>`
    : `<section class="briefing"><h2>Resumen IA</h2><p class="muted">Todavía no hay resumen generado. Se activa al configurar la clave de Gemini (ver README).</p></section>`;
  return intro + (top.length ? `<h3 class="section-title">Noticias resumidas</h3>${listHtml(top, '')}` : '');
}

function settingsHtml() {
  const p = state.profile;
  const levels = [[-2, 'Ocultar'], [0, 'Poco'], [1, 'Normal'], [2, 'Mucho'], [3, 'Me encanta']];
  const topicRows = Object.entries(TOPICS)
    .map(([t, label]) => `<label class="row"><span>${label}</span><select data-topic="${t}">${levels.map(([v, l]) => `<option value="${v}"${(p.topics[t] ?? 1) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`)
    .join('');
  const byId = new Map();
  for (const s of state.data.sources) byId.set(s.name, [...(byId.get(s.name) ?? []), s]);
  const sourceRows = [...byId.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([name, feeds]) => {
      const v = p.sources[feeds[0].id] ?? 0;
      const ok = feeds.some((f) => f.ok);
      return `<label class="row"><span>${esc(name)}${ok ? '' : ' <span class="muted small">(sin datos ahora)</span>'}</span><select data-source="${feeds.map((f) => f.id).join(',')}">
        <option value="1"${v === 1 ? ' selected' : ''}>Favorito</option><option value="0"${v === 0 ? ' selected' : ''}>Normal</option><option value="-1"${v === -1 ? ' selected' : ''}>Silenciar</option></select></label>`;
    })
    .join('');
  const learnedTop = Object.entries(p.learned.terms).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t]) => t).join(', ');
  return `<section class="settings">
    <h2>Tus intereses</h2>${topicRows}
    <h2>Idiomas</h2>
    <label class="row"><span>Español</span><input type="checkbox" data-lang="es"${p.langs.includes('es') ? ' checked' : ''}></label>
    <label class="row"><span>Inglés</span><input type="checkbox" data-lang="en"${p.langs.includes('en') ? ' checked' : ''}></label>
    <h2>Palabras clave</h2>
    <label class="stack"><span>Potenciar (una por línea)</span><textarea data-kw="boostKeywords" rows="3" placeholder="fusión nuclear&#10;James Webb">${esc(p.boostKeywords.join('\n'))}</textarea></label>
    <label class="stack"><span>Silenciar (una por línea)</span><textarea data-kw="muteKeywords" rows="3" placeholder="horóscopo">${esc(p.muteKeywords.join('\n'))}</textarea></label>
    <h2>Medios</h2>${sourceRows}
    <h2>Aprendizaje</h2>
    <p class="muted small">${learnedTop ? `Lo que más te interesa según lo que lees: ${esc(learnedTop)}` : 'Aún no hay datos: abre, guarda o puntúa noticias y el orden se irá adaptando.'}</p>
    <div class="actions">
      <button data-act="export">Exportar perfil</button>
      <label class="button">Importar perfil<input type="file" accept="application/json" data-act="import" hidden></label>
      <button data-act="reset-learning">Borrar aprendizaje</button>
      <button data-act="onboarding">Repetir configuración inicial</button>
    </div>
    <p class="muted small">Tu perfil se guarda solo en este navegador. Las noticias enlazan siempre al medio original.</p>
  </section>`;
}

function render() {
  if (!state.data) return;
  $tabs.innerHTML = tabsHtml();
  const p = state.profile;
  const v = state.view;
  let html;
  if (v === 'foryou') html = listHtml(rankStories(state.data.stories, p), 'No hay noticias que encajen con tus filtros.');
  else if (v === 'briefing') html = briefingHtml();
  else if (v === 'saved') html = listHtml(Object.values(p.saved).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')), 'Aún no has guardado noticias.');
  else if (v === 'settings') html = settingsHtml();
  else {
    const topic = v.slice('topic:'.length);
    html = listHtml(rankStories(state.data.stories.filter((s) => s.topics.includes(topic)), p), 'No hay noticias de este tema ahora mismo.');
  }
  $main.innerHTML = html;
}

// ---------- interactions ----------

$tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  state.view = btn.dataset.view;
  state.limit = PAGE;
  render();
  window.scrollTo({ top: 0 });
});

$main.addEventListener('click', (e) => {
  const link = e.target.closest('[data-open]');
  if (link) {
    const story = findStory(link.dataset.open);
    if (story && !state.profile.read[story.id]) {
      state.profile.read[story.id] = Date.now();
      learn(state.profile, story, 'open');
      persist();
      link.closest('.card')?.classList.add('read');
    }
    return;
  }
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.tagName === 'INPUT') return;
  const act = btn.dataset.act;
  const p = state.profile;
  if (act === 'more') {
    state.limit += PAGE;
    return render();
  }
  if (act === 'export') return exportProfile();
  if (act === 'reset-learning') {
    if (confirm('¿Borrar lo aprendido de tus lecturas? Tus temas y medios se mantienen.')) {
      p.learned = defaultProfile().learned;
      persist();
      render();
    }
    return;
  }
  if (act === 'onboarding') return openOnboarding();

  const card = btn.closest('.card');
  const story = card && findStory(card.dataset.id);
  if (!story) return;
  if (act === 'save') {
    if (p.saved[story.id]) delete p.saved[story.id];
    else {
      p.saved[story.id] = story;
      learn(p, story, 'save');
    }
  } else if (act === 'hide') {
    p.hidden[story.id] = Date.now();
    learn(p, story, 'hide');
  } else {
    learn(p, story, act);
    btn.textContent = act === 'like' ? '👍 Anotado' : '👎 Anotado';
    btn.disabled = true;
    persist();
    return;
  }
  persist();
  if (act === 'hide' || state.view === 'saved') card.remove();
  else card.outerHTML = storyCard(story);
});

$main.addEventListener('change', (e) => {
  const el = e.target;
  const p = state.profile;
  if (el.dataset.topic) p.topics[el.dataset.topic] = Number(el.value);
  else if (el.dataset.source) for (const id of el.dataset.source.split(',')) p.sources[id] = Number(el.value);
  else if (el.dataset.lang) p.langs = [...document.querySelectorAll('[data-lang]')].filter((c) => c.checked).map((c) => c.dataset.lang);
  else if (el.dataset.kw) p[el.dataset.kw] = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
  else if (el.dataset.act === 'import') return importProfile(el.files[0]);
  else return;
  persist();
  $tabs.innerHTML = tabsHtml();
});

function exportProfile() {
  const blob = new Blob([JSON.stringify(state.profile, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'mi-diario-perfil.json' });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importProfile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data !== 'object' || !data.topics) throw new Error();
    state.profile = { ...defaultProfile(), ...data, onboarded: true };
    persist();
    render();
  } catch {
    alert('El archivo no es un perfil válido.');
  }
}

// ---------- onboarding ----------

function openOnboarding() {
  const dlg = document.getElementById('onboarding');
  const p = state.profile;
  dlg.innerHTML = `<form method="dialog" class="onboarding">
    <h2>Bienvenido a Mi Diario</h2>
    <p>Elige qué te interesa. Después, la web aprenderá de lo que abres, guardas y puntúas.</p>
    <fieldset><legend>Temas</legend><div class="chips">${Object.entries(TOPICS)
      .map(([t, l]) => `<label class="pick"><input type="checkbox" name="topic" value="${t}"${(p.topics[t] ?? 1) >= 3 ? ' checked' : ''}><span>${l}</span></label>`)
      .join('')}</div><p class="muted small">Los marcados tendrán prioridad; el resto seguirá apareciendo con menos peso.</p></fieldset>
    <fieldset><legend>Idiomas</legend><div class="chips">
      <label class="pick"><input type="checkbox" name="lang" value="es"${p.langs.includes('es') ? ' checked' : ''}><span>Español</span></label>
      <label class="pick"><input type="checkbox" name="lang" value="en"${p.langs.includes('en') ? ' checked' : ''}><span>Inglés</span></label>
    </div></fieldset>
    <button class="primary" value="ok">Empezar</button>
  </form>`;
  dlg.querySelector('form').addEventListener('submit', () => {
    const f = new FormData(dlg.querySelector('form'));
    const picked = new Set(f.getAll('topic'));
    for (const t of Object.keys(TOPICS)) p.topics[t] = picked.has(t) ? 3 : 1;
    const langs = f.getAll('lang');
    p.langs = langs.length ? langs : ['es', 'en'];
    p.onboarded = true;
    persist();
    render();
  });
  dlg.showModal();
}

// ---------- boot ----------

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
loadData();
