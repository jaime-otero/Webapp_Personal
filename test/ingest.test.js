import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../scripts/ingest/parse.js';
import { classify } from '../scripts/ingest/classify.js';
import { clusterArticles } from '../scripts/ingest/cluster.js';
import { cleanText } from '../scripts/ingest/text.js';

const src = { id: 'test', name: 'Test', lang: 'en', region: 'int', sections: [] };

test('cleanText strips raw, CDATA and entity-escaped HTML', () => {
  assert.equal(cleanText('<p>Hola <b>mundo</b></p>'), 'Hola mundo');
  assert.equal(cleanText('&lt;p&gt;Caf&eacute; &amp;amp; t&#233;&lt;/p&gt;'), 'Café & té');
});

test('parseFeed reads RSS 2.0 with media image', () => {
  const xml = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
    <item><title><![CDATA[Quantum computer breaks record]]></title><link>https://ex.com/a</link>
    <description>&lt;p&gt;A new &lt;b&gt;qubit&lt;/b&gt; design.&lt;/p&gt;</description>
    <pubDate>Sun, 04 Oct 2026 10:00:00 GMT</pubDate><media:content url="https://ex.com/a.jpg" medium="image"/></item>
  </channel></rss>`;
  const [a] = parseFeed(xml, src);
  assert.equal(a.title, 'Quantum computer breaks record');
  assert.equal(a.summary, 'A new qubit design.');
  assert.equal(a.image, 'https://ex.com/a.jpg');
  assert.equal(a.publishedAt, '2026-10-04T10:00:00.000Z');
});

test('parseFeed reads Atom', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Black hole image</title>
    <link rel="alternate" href="https://ex.com/b"/><updated>2026-10-04T09:00:00Z</updated><summary>Webb sees it</summary></entry></feed>`;
  const [a] = parseFeed(xml, src);
  assert.equal(a.url, 'https://ex.com/b');
  assert.equal(a.summary, 'Webb sees it');
});

// Real headlines from 4 October 2026.
const cls = (title, feedSections, summary = '') => classify({ title, summary, categories: [], feedSections });

test('classify: España by subsection', () => {
  assert.deepEqual(cls('Sumar presentará su Frente Amplio y anunciará el candidato electoral el 17 de octubre', ['espana']), ['espana/politica']);
  assert.ok(cls('Mueren dos jóvenes ahogados en una playa de Guardamar del Segura', ['espana']).includes('espana/sociedad'));
  assert.ok(cls('Póquer de Pina con un Barça de cine', ['espana/deportes']).includes('espana/deportes'));
  assert.ok(cls('Los Javis y La bola negra desembarcan en Hollywood: la película aspira al Oscar', ['espana']).includes('espana/cultura'));
});

test('classify: general feeds move stories to the region they happen in', () => {
  assert.deepEqual(cls("Brazil election: Early count puts Bolsonaro ahead of Lula", ['internacional']), ['internacional/latam']);
  assert.deepEqual(cls('Torrential rain and flooding leave 2 dead and 1 missing in Spain\'s Catalonia region', ['internacional']).filter((s) => s.startsWith('espana')).length, 1);
  assert.ok(cls('Trump takes red state midterm blitz to Nebraska as GOP frets over Senate race', ['internacional']).includes('eeuu/politica'));
  assert.deepEqual(cls('Russia threatens more strikes after Zelensky vows to hit oil refineries', ['espana']), ['internacional/europa']);
});

test('classify: NBA always lands in EE. UU. → NBA, from any outlet', () => {
  assert.ok(cls('Doncic se pone la corona de los Lakers: "Estoy listo"', ['espana/deportes']).includes('eeuu/nba'));
  assert.ok(cls('Could the Bucks become the center of the trade market?', ['eeuu/nba']).includes('eeuu/nba'));
  assert.ok(!cls('Póquer de Pina con un Barça de cine', ['espana/deportes']).includes('eeuu/nba'));
});

test('classify: topical sections, stricter on general news feeds', () => {
  assert.deepEqual(cls('Giant fluctuations of focused light reveal hidden correlations in opaque materials', ['ciencia/fisica']), ['ciencia/fisica']);
  assert.ok(cls('Physicists observe a new quantum effect in superconductors', ['internacional']).includes('ciencia/fisica'));
  assert.ok(!cls('Dos muertos y un desaparecido por el fuerte temporal en Cataluña', ['espana']).some((s) => s.startsWith('ciencia')));
  assert.ok(cls('OpenAI safety leader quits, warning AI company culture is broken', ['tecnologia']).includes('tecnologia/ia'));
  assert.ok(cls('Por qué el precio del petróleo se mantiene estancado en los 100 dólares', ['espana', 'economia']).includes('economia/energia'));
});

test('classify: Deportes by sport, from sports feeds and regional sports news', () => {
  assert.deepEqual(cls('Pogacar gana el Mundial de ciclismo tras un ataque a 100 km de meta', ['deportes']), ['deportes/ciclismo']);
  assert.deepEqual(cls('Ironman Kona: the women\'s race preview', ['deportes/resistencia']), ['deportes/resistencia']);
  assert.ok(cls('Mahomes lanza tres touchdowns y los Chiefs siguen invictos', ['espana/deportes']).includes('deportes/nfl'));
  assert.deepEqual(cls('Póquer de Pina con un Barça de cine', ['espana/deportes']).sort(), ['deportes/futbol', 'espana/deportes']);
  assert.ok(cls('Could the Bucks become the center of the trade market?', ['eeuu/nba']).includes('deportes/baloncesto'));
  assert.ok(cls('Shiffrin vuelve a ganar en el eslalon de Levi', ['deportes']).includes('deportes/invierno'));
  assert.ok(cls('Pecco Bagnaia aprovecha el K.O. de Marc Márquez', ['espana/deportes']).includes('deportes/motor'));
  assert.ok(cls('Topuria defenderá su cinturón de la UFC', ['deportes']).includes('deportes/combate'));
  assert.ok(cls('Livorno será la sede del F1 de la vela: regatas de SailGP', ['deportes']).includes('deportes/acuaticos'));
  assert.ok(cls('Jon Rahm firma su mejor vuelta en el LIV Golf', ['deportes']).includes('deportes/otros'));
  assert.ok(!cls('Sumar presentará su Frente Amplio y anunciará el candidato electoral el 17 de octubre', ['espana']).some((s) => s.startsWith('deportes')));
});

test('classify: NFL and college sports land in EE. UU. and in Deportes', () => {
  const nfl = cls('Mahomes lanza tres touchdowns y los Chiefs siguen invictos', ['espana/deportes']);
  assert.ok(nfl.includes('eeuu/nfl') && nfl.includes('deportes/nfl'));
  assert.deepEqual(cls('Bengals vs. Dolphins odds: Opening lines for Week 5 matchup', ['eeuu/nfl']).sort(), ['deportes/nfl', 'eeuu/nfl']);
  const college = cls('Heisman watch: the college football quarterbacks to follow', ['deportes']);
  assert.ok(college.includes('eeuu/universitario') && !college.includes('eeuu/nfl') && college.includes('deportes/nfl'));
  assert.ok(cls('Latest on NCAA eligibility chaos: LSU roster count', ['eeuu/universitario']).includes('eeuu/universitario'));
  assert.ok(!cls('Joint Chiefs chairman testifies before the Senate', ['internacional']).includes('eeuu/nfl'));
});

test('clusterArticles groups the same story across outlets and keeps every section', () => {
  const mk = (id, source, title, sections) => ({ id, url: `https://x/${id}`, source, sourceId: source, title, summary: '', lang: 'es', publishedAt: '2026-10-04T10:00:00Z', image: null, sections });
  const stories = clusterArticles([
    mk('1', 'A', 'Mueren dos jóvenes ahogados en una playa de Guardamar del Segura', ['espana/sociedad']),
    mk('2', 'B', 'Mueren dos jóvenes ahogados en una playa de Guardamar de Segura, Alicante', ['espana']),
    mk('3', 'A', 'Mueren dos jóvenes ahogados en la playa de Guardamar del Segura', ['espana/deportes']),
    mk('4', 'C', 'El Gobierno aprueba los presupuestos generales', ['espana/politica']),
  ]);
  assert.equal(stories.length, 2);
  const drown = stories.find((s) => s.sources.length === 2);
  assert.deepEqual(drown.sections.sort(), ['espana', 'espana/deportes', 'espana/sociedad']);
});

test('classify keeps foreign science out of España on Spanish general feeds', () => {
  // El Mundo (general) and elDiario.es Sociedad on the Medicine Nobel: Ciencia, not España.
  const nobel = 'Premio Nobel de Medicina para Karl Deisseroth, Peter Hegemann y Georg Nagel por sus descubrimientos en optogenética';
  const elMundo = cls(nobel, ['espana']);
  assert.ok(elMundo.some((s) => s.startsWith('ciencia')) && !elMundo.some((s) => s.startsWith('espana')), elMundo.join());
  assert.ok(!cls('Premio Nobel de Medicina 2026 para los creadores de la optogenética', ['espana/sociedad']).some((s) => s.startsWith('espana')));
  // Science that does happen in Spain stays in both.
  assert.ok(cls('El CSIC descubre en España una nueva especie de dinosaurio', ['espana']).includes('espana'));
  // Ordinary Spanish news is untouched.
  assert.ok(cls('Detenido un hombre tras un accidente de tráfico en Vigo', ['espana']).includes('espana/sociedad'));
});

test('classify: each Nobel goes to its topic, not to España unless a Spaniard wins', () => {
  const noEspana = (secs) => !secs.some((s) => s.startsWith('espana'));
  const lit = cls('El Nobel de Literatura 2026 premia a la escritora coreana Han Kang', ['espana']);
  assert.ok(noEspana(lit) && !lit.some((s) => s.startsWith('ciencia')), lit.join());
  assert.ok(!cls('Nobel Prize in Literature goes to Korean novelist', ['internacional']).some((s) => s.startsWith('ciencia')));
  assert.deepEqual(cls('Nobel de Economía para tres expertos en desigualdad', ['espana']), ['economia']);
  assert.deepEqual(cls('Brian Schmidt, premio Nobel de Física: el universo fue más loco', ['espana/sociedad']), ['ciencia']);
  assert.deepEqual(cls('Un científico español, Premio Nobel de Química', ['espana']).sort(), ['ciencia', 'espana']);
});

test('classify: world-region feeds send stories about Spain to España', () => {
  assert.deepEqual(cls('Spain floods: death toll rises in Valencia', ['internacional/europa']), ['espana/sociedad']);
  assert.deepEqual(cls('Spanish PM Pedro Sanchez calls snap election', ['internacional/europa']), ['espana/politica']);
  assert.deepEqual(cls('Germany and France clash over EU budget', ['internacional/europa']), ['internacional/europa']);
  // Mostly about Europe, Spain only mentioned: stays in Europa.
  assert.deepEqual(cls('EU leaders back Spain on migration plan', ['internacional/europa']), ['internacional/europa']);
});
