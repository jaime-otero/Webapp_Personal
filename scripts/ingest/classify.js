import { normalize } from './text.js';

// Keywords (accent-free, lowercase; ES + EN). A keyword ending in '*' matches as a prefix.
export const TOPIC_KEYWORDS = {
  politica: ['gobierno', 'congreso', 'senado', 'eleccion*', 'psoe', 'pp', 'vox', 'sumar', 'ministr*', 'presidente', 'parlament*', 'election*', 'government', 'senate', 'minister'],
  economia: ['economi*', 'inflacion', 'ibex', 'bolsa', 'empleo', 'paro', 'pib', 'banco', 'bce', 'arancel*', 'impuesto*', 'hipoteca*', 'vivienda', 'empresa*', 'mercado*', 'economy', 'inflation', 'tariff*', 'stocks', 'market*', 'gdp', 'fed'],
  internacional: ['ucrania', 'rusia', 'gaza', 'israel', 'eeuu', 'trump', 'china', 'otan', 'onu', 'ukraine', 'russia', 'nato', 'united nations', 'putin', 'zelensky', 'iran'],
  ciencia: ['cientific*', 'investigador*', 'estudio', 'scientist*', 'researcher*', 'study', 'biolog*', 'quimic*', 'chemistr*', 'genetic*', 'genoma', 'evoluci*', 'evolution*', 'fosil*', 'fossil*', 'neuro*'],
  fisica: ['fisic*', 'physic*', 'cuantic*', 'quantum', 'particula', 'particulas', 'particle*', 'cern', 'boson', 'neutrino*', 'laser*', 'superconduct*', 'relativ*', 'materia oscura', 'dark matter', 'fusion', 'plasma', 'foton*', 'photon*', 'qubit*', 'gravitational wave*', 'ondas gravitacionales', 'collider', 'acelerador'],
  espacio: ['nasa', 'agencia espacial', 'space agency', 'spacex', 'cohete espacial', 'rocket*', 'satelite*', 'satellite*', 'galaxia*', 'galax*', 'agujero negro', 'black hole*', 'telescopio', 'telescope', 'webb', 'marte', 'mars', 'lunar', 'moon', 'asteroide*', 'asteroid*', 'exoplanet*', 'astronom*', 'artemis', 'orbit*'],
  tecnologia: ['inteligencia artificial', 'ia', 'ai', 'chip*', 'semiconductor*', 'robot*', 'software', 'apple', 'google', 'microsoft', 'openai', 'anthropic', 'nvidia', 'ciberataque*', 'cyber*', 'startup*', 'algoritmo*', 'algorithm*', 'smartphone*', 'computacion', 'computing', 'innovaci*', 'innovation'],
  salud: ['salud', 'health', 'cancer', 'vacuna*', 'vaccine*', 'hospital*', 'enfermedad*', 'disease*', 'virus', 'pandemia', 'medic*', 'farmac*', 'drug*', 'alzheimer'],
  clima: ['clima*', 'climate', 'calentamiento', 'warming', 'emisiones', 'emission*', 'co2', 'incendio*', 'wildfire*', 'sequia', 'drought', 'dana', 'renovable*', 'renewable*', 'energia solar', 'solar power', 'biodiversidad'],
  deportes: ['futbol', 'liga', 'champions', 'real madrid', 'fc barcelona', 'barca', 'atletico de madrid', 'nba', 'tenis', 'nadal', 'alcaraz', 'formula 1', 'f1', 'ciclismo', 'tour de francia', 'la vuelta', 'football', 'soccer', 'olympic*', 'olimpi*', 'copa del mundo', 'world cup'],
  cultura: ['cine', 'pelicula*', 'film', 'libro*', 'novela', 'book*', 'musica', 'music', 'museo*', 'museum*', 'arte', 'exposicion', 'festival', 'teatro'],
};

const compiled = Object.fromEntries(
  Object.entries(TOPIC_KEYWORDS).map(([topic, words]) => [
    topic,
    words.map((w) => new RegExp(`\\b${w.endsWith('*') ? w.slice(0, -1) + '\\w*' : w + '\\b'}`)),
  ]),
);

// Feed-level topics are trusted; keyword topics need a hit in the title or two in the summary.
export function classify(article) {
  const title = normalize(article.title);
  const body = normalize(`${article.summary} ${article.categories.join(' ')}`);
  const topics = new Set(article.feedTopics.filter((t) => t !== 'espana'));
  for (const [topic, regexes] of Object.entries(compiled)) {
    let score = 0;
    for (const re of regexes) {
      if (re.test(title)) score += 2;
      else if (re.test(body)) score += 1;
    }
    if (score >= 2) topics.add(topic);
  }
  if (topics.has('fisica') || topics.has('espacio')) topics.add('ciencia');
  if (article.region === 'es' && article.feedTopics.includes('espana')) topics.add('espana');
  return [...topics];
}
