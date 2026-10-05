import { scoreGroups } from '../../web/lib/taxonomy.js';

// Assigns each article to sections/subsections ("espana/deportes", "ciencia/fisica"…).
//
// Two independent dimensions:
//  - Region sections (España, EE. UU., Internacional): where the story happens. The feed gives a
//    default; for general feeds the keywords may move it (a BBC story about Catalonia → España).
//  - Topical sections (Ciencia, Tecnología, Economía, Deportes): what it is about, regardless of region.
//
// A keyword group counts when it scores ≥ 2 (one hit in the title or two in the body). Topical
// sections need ≥ 3 on general news feeds, so "dos muertos por el temporal" stays out of Clima.

const REGIONS = ['espana', 'eeuu', 'europa', 'latam', 'oriente-medio', 'asia'];
const REGION_SECTION = { espana: 'espana', eeuu: 'eeuu', europa: 'internacional/europa', latam: 'internacional/latam', 'oriente-medio': 'internacional/oriente-medio', asia: 'internacional/asia' };
const TOPICAL = {
  ciencia: { generic: 'ciencia', subs: { fisica: 'fisica', espacio: 'espacio', vida: 'vida', clima: 'clima' } },
  tecnologia: { generic: 'tecnologia', subs: { ia: 'ia', empresas: 'tec-empresas', innovacion: 'innovacion' } },
  economia: { generic: 'economia', subs: { mercados: 'mercados', empresas: 'eco-empresas', energia: 'energia' } },
  deportes: {
    generic: 'deporte',
    subs: { futbol: 'dep-futbol', baloncesto: 'dep-baloncesto', tenis: 'dep-tenis', nfl: 'dep-nfl', rugby: 'dep-rugby', beisbol: 'dep-beisbol', invierno: 'dep-invierno', atletismo: 'dep-atletismo', ciclismo: 'dep-ciclismo', resistencia: 'dep-resistencia', motor: 'dep-motor', combate: 'dep-combate', acuaticos: 'dep-acuaticos', otros: 'dep-otros' },
  },
};
const REGION_SUBS = {
  espana: { politica: 'politica-es', economia: 'economia', sociedad: 'sociedad', deportes: 'deportes', cultura: 'cultura' },
  eeuu: { politica: 'politica-us', economia: 'economia', sociedad: 'sociedad', nba: 'nba' },
};

function pickRegion(scores, hint) {
  // The feed's own region gets a head start so a single passing mention does not move it.
  let best = null;
  let bestScore = 1;
  for (const r of REGIONS) {
    const s = (scores[`r:${r}`] ?? 0) + (r === hint ? 1.5 : 0);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}

export function classify(article) {
  const hints = article.feedSections ?? [];
  const scores = scoreGroups(article.title, `${article.summary ?? ''} ${(article.categories ?? []).join(' ')}`);
  const has = (group, min = 2) => (scores[group] ?? 0) >= min;
  const sections = new Set();

  const hintRegions = hints.map((h) => h.split('/')[0]).filter((s) => s in REGION_SUBS || s === 'internacional');
  const fixedRegion = hints.find((h) => h.includes('/') && (h.startsWith('espana/') || h.startsWith('eeuu/') || h.startsWith('internacional/')));
  const isNba = hints.includes('eeuu/nba') || has('nba');
  const isNcaa = hints.includes('eeuu/universitario') || has('dep-ncaa');
  // "College football" also matches the NFL group: college games stay in Deporte universitario.
  const isNfl = hints.includes('eeuu/nfl') || (has('dep-nfl') && !isNcaa);
  const usSport = isNba || isNfl || isNcaa;
  const generalFeed = hintRegions.length > 0 && !fixedRegion;

  // --- region ---
  let region = null; // 'espana' | 'eeuu' | 'internacional' | subregion id
  if (usSport) region = 'eeuu';
  else if (fixedRegion?.startsWith('internacional/')) {
    // A world-region feed (BBC Europe) still carries stories about Spain or the US: they go there.
    const sub = fixedRegion.split('/')[1];
    region = pickRegion(scores, sub) ?? sub;
  } else if (fixedRegion) region = fixedRegion.split('/')[0];
  else if (generalFeed) {
    const hint = hintRegions[0] === 'internacional' ? null : hintRegions[0];
    region = pickRegion(scores, hint) ?? hintRegions[0];
  }

  if (region === 'espana' || region === 'eeuu') {
    // A feed that is already specific (Mundo Deportivo → deportes) needs stronger evidence for others.
    const subMin = fixedRegion && !fixedRegion.startsWith('internacional/') ? 3 : 2;
    for (const [sub, group] of Object.entries(REGION_SUBS[region])) {
      if (hints.includes(`${region}/${sub}`) || has(group, subMin)) sections.add(`${region}/${sub}`);
    }
    if (isNba) sections.add('eeuu/nba');
    if (isNfl) sections.add('eeuu/nfl');
    if (isNcaa) sections.add('eeuu/universitario');
    if (![...sections].some((s) => s.startsWith(`${region}/`))) sections.add(region);
  } else if (region === 'internacional') sections.add('internacional');
  else if (region) sections.add(REGION_SECTION[region]);

  // --- topical sections ---
  const min = generalFeed || fixedRegion ? 3 : 2;
  for (const [sec, { generic, subs }] of Object.entries(TOPICAL)) {
    const hinted = hints.some((h) => h === sec || h.startsWith(`${sec}/`));
    // A mixed feed (Expansión: region + economy) only vouches for the topic with some keyword evidence.
    const trusted = hinted && !generalFeed;
    let any = false;
    for (const [sub, group] of Object.entries(subs)) {
      if ((trusted && hints.includes(`${sec}/${sub}`)) || has(group, hinted ? 2 : min)) {
        sections.add(`${sec}/${sub}`);
        any = true;
      }
    }
    const evidence = has(generic, 2) || Object.values(subs).some((g) => has(g, 2));
    if (!any && ((hints.includes(sec) && (trusted || evidence)) || has(generic, min))) sections.add(sec);
  }

  // The science and economics Nobels belong to those sections wherever they come from.
  if (has('nobel-ciencia') && ![...sections].some((s) => s.startsWith('ciencia'))) sections.add('ciencia');
  if (has('nobel-economia') && ![...sections].some((s) => s.startsWith('economia'))) sections.add('economia');

  // Science, tech or a Nobel from a Spanish (or US) feed that never mentions the country is not
  // national news: the Nobel de Medicina told by El Mundo goes to Ciencia only, not to España, and
  // a Nobel de Literatura for a foreign writer goes to Internacional.
  const local = region === 'espana' || region === 'eeuu';
  const regionEvidence = has(`r:${region}`) || has(REGION_SUBS[region]?.politica ?? '') || usSport;
  if (local && (generalFeed || fixedRegion) && !regionEvidence && (has('nobel') || [...sections].some((s) => /^(ciencia|tecnologia)/.test(s)))) {
    for (const s of [...sections]) if (s === region || s.startsWith(`${region}/`)) sections.delete(s);
    if (!sections.size) sections.add('internacional');
  }

  // Economy news that clearly happens in Spain or the US also belongs to that region.
  if ([...sections].some((s) => s.startsWith('economia'))) {
    if (has('r:espana')) sections.add('espana/economia');
    if (has('r:eeuu')) sections.add('eeuu/economia');
  }
  // Sports news from a region (Marca, an NBA feed…) also belongs to Deportes.
  if (sections.has('espana/deportes') || usSport) {
    for (const [sub, group] of Object.entries(TOPICAL.deportes.subs)) if (has(group)) sections.add(`deportes/${sub}`);
    if (isNba) sections.add('deportes/baloncesto');
    if (isNfl) sections.add('deportes/nfl');
    if (![...sections].some((s) => s.startsWith('deportes/'))) sections.add('deportes');
  }
  // A subsection already implies its parent section.
  for (const s of [...sections]) if (s.includes('/')) sections.delete(s.split('/')[0]);
  return [...sections];
}
