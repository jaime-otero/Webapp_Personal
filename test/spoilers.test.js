import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSpoilerText, isSpoiler } from '../web/lib/spoilers.js';

const SPOILERS = [
  'Warriors beat Lakers 120-115 behind Curry’s 40 points',
  'Celtics rout Knicks to take 3-1 series lead',
  'Thunder edge Nuggets in overtime thriller',
  'Wembanyama records triple-double as Spurs top Rockets',
  'Bucks fall to Heat despite Giannis’ 35 points',
  'Knicks clinch No. 2 seed with win over Pacers',
  'Los Warriors ganan a los Lakers con 40 puntos de Curry',
  'Doncic lidera el triunfo de los Lakers ante los Suns',
  'Los Celtics arrollan a los Knicks y se clasifican para la final',
  'Victoria de los Thunder en el séptimo partido',
  'Los Bucks caen en Miami y pierden la serie',
  '112-108: los Spurs remontan en el último cuarto',
  'Los Cavaliers conquistan Málaga y el Carpena',
  'Primera grieta de los Knicks campeones: Towns no renueva',
];
const SAFE = [
  'Stephen Curry renueva con los Golden State Warriors por 2 años y 116 millones de dólares',
  'Jalen Duren says he wants to be a Piston for life',
  'Could the Bucks become the center of the trade market?',
  'Hezonja vuelve a la NBA con 8 cm y 32 kg más',
  'Luka Doncic, sobre la ausencia de LeBron James: “Es un nuevo desafío”',
  'Josh Kushner and Bob Iger reportedly buying Los Angeles Lakers for $12.5bn',
  'Kawhi: “He sido una distracción durante 70 días”',
  'The 2025-26 season preview: five questions for the Lakers',
  'Ben Simmons handed NBA lifeline in one-year deal with Sacramento Kings',
];

test('detects result headlines (ES + EN)', () => {
  for (const t of SPOILERS) assert.ok(isSpoilerText(t), t);
});

test('lets transfer, contract and off-court news through', () => {
  for (const t of SAFE) assert.ok(!isSpoilerText(t), t);
});

test('only NBA stories are treated as spoilers, and custom words count', () => {
  const nba = { title: 'Los Spurs presentan su nueva equipación', sections: ['eeuu/nba'], sources: [] };
  assert.equal(isSpoiler(nba), false);
  assert.equal(isSpoiler(nba, ['equipación']), true);
  assert.equal(isSpoiler({ title: 'Lula gana las elecciones', sections: ['internacional/latam'], sources: [] }), false);
  assert.equal(isSpoiler({ title: 'Partido aburrido', sections: ['eeuu/nba'], sources: [{ title: 'Warriors beat Lakers' }] }), true);
});
