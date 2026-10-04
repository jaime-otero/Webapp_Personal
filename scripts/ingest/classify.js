import { scoreGroups } from '../../web/lib/taxonomy.js';

// Assigns each article to sections/subsections ("espana/deportes", "ciencia/fisica"…).
//
// Two independent dimensions:
//  - Region sections (España, EE. UU., Internacional): where the story happens. The feed gives a
//    default; for general feeds the keywords may move it (a BBC story about Catalonia → España).
//  - Topical sections (Ciencia, Tecnología, Economía): what it is about, regardless of region.
//
// A keyword group counts when it scores ≥ 2 (one hit in the title or two in the body). Topical
// sections need ≥ 3 on general news feeds, so "dos muertos por el temporal" stays out of Clima.

const REGIONS = ['espana', 'eeuu', 'europa', 'latam', 'oriente-medio', 'asia'];
const REGION_SECTION = { espana: 'espana', eeuu: 'eeuu', europa: 'internacional/europa', latam: 'internacional/latam', 'oriente-medio': 'internacional/oriente-medio', asia: 'internacional/asia' };
const TOPICAL = {
  ciencia: { generic: 'ciencia', subs: { fisica: 'fisica', espacio: 'espacio', vida: 'vida', clima: 'clima' } },
  tecnologia: { generic: 'tecnologia', subs: { ia: 'ia', empresas: 'tec-empresas', innovacion: 'innovacion' } },
  economia: { generic: 'economia', subs: { mercados: 'mercados', empresas: 'eco-empresas', energia: 'energia' } },
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
  const generalFeed = hintRegions.length > 0 && !fixedRegion;

  // --- region ---
  let region = null; // 'espana' | 'eeuu' | 'internacional' | subregion id
  if (isNba) region = 'eeuu';
  else if (fixedRegion) region = fixedRegion.startsWith('internacional/') ? fixedRegion.split('/')[1] : fixedRegion.split('/')[0];
  else if (generalFeed) {
    const hint = hintRegions[0] === 'internacional' ? null : hintRegions[0];
    region = pickRegion(scores, hint) ?? hintRegions[0];
  }

  if (region === 'espana' || region === 'eeuu') {
    // A feed that is already specific (Mundo Deportivo → deportes) needs stronger evidence for others.
    const subMin = fixedRegion ? 3 : 2;
    for (const [sub, group] of Object.entries(REGION_SUBS[region])) {
      if (hints.includes(`${region}/${sub}`) || has(group, subMin)) sections.add(`${region}/${sub}`);
    }
    if (isNba) sections.add('eeuu/nba');
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

  // Economy news that clearly happens in Spain or the US also belongs to that region.
  if ([...sections].some((s) => s.startsWith('economia'))) {
    if (has('r:espana')) sections.add('espana/economia');
    if (has('r:eeuu')) sections.add('eeuu/economia');
  }
  // A subsection already implies its parent section.
  for (const s of [...sections]) if (s.includes('/')) sections.delete(s.split('/')[0]);
  return [...sections];
}
