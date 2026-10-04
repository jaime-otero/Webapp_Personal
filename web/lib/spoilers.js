// NBA spoiler detection: game results, scores and box-score lines. Shared by the ingest
// script (to keep spoilers away from the AI summaries) and the web app (to cover the cards).
// It errs on the side of hiding: a covered card can always be revealed.

import { normalize } from './tokens.js';
import { compileKeywords } from './taxonomy.js';

const PATTERNS = [
  // Scores: 120-110, 98–95, 101:99 (but not seasons like 2025-26 or "25-26 season")
  /(?<![\d/])\d{2,3}\s?[-–:]\s?\d{2,3}(?![\d/])(?!\s*(season|temporada))/,
  // Box-score lines
  /\b\d{1,2}\s?(points|pts|puntos|rebounds|rebotes|assists|asistencias|tapones|blocks|steals|robos|triples|threes)\b/,
  /\b(triple[- ]double|triple[- ]doble|doble[- ]doble|double[- ]double|career[- ]high|record de anotacion|season[- ]high|game[- ]winner|buzzer[- ]beater|canasta ganadora)\b/,
  // Series status
  /\b(game|juego|partido) \d\b.*\b(series|serie|final|finals|playoff|playoffs)\b/,
  /\b(lead|leads|led|tie|ties|tied|domina|dominan|empata|empatan)\b.*\bseries\b/,
  /\b\d-\d\b.*\b(series|serie|eliminatoria)\b/,
];

// Result verbs (ES + EN), checked on accent-free lowercase text.
const RESULT_WORDS = compileKeywords([
  // English
  'beat', 'beats', 'beating', 'top', 'tops', 'topped', 'rout', 'routs', 'routed', 'edge', 'edges', 'edged', 'down', 'downs', 'downed',
  'defeat', 'defeats', 'defeated', 'win', 'wins', 'won', 'winning streak', 'lose', 'loses', 'lost', 'losing streak', 'fall', 'falls', 'fell',
  'eliminate*', 'advance', 'advances', 'advanced', 'clinch*', 'sweep', 'sweeps', 'swept', 'crush*', 'blow out', 'blows out', 'blew out',
  'hold off', 'holds off', 'held off', 'rally', 'rallies', 'rallied', 'stun', 'stuns', 'stunned', 'survive', 'survives', 'survived',
  'outlast*', 'knock out', 'knocks out', 'knocked out', 'upset', 'upsets', 'snap', 'snaps', 'snapped', 'victory', 'victories', 'loss', 'losses',
  'champion', 'champions', 'championship', 'title', 'finals mvp', 'overtime', 'ot thriller',
  // Español
  'gana', 'ganan', 'gano', 'ganaron', 'vence', 'vencen', 'vencio', 'vencieron', 'derrota*', 'arrolla*', 'remonta*', 'cae', 'caen', 'cayo',
  'cayeron', 'pierde', 'pierden', 'perdio', 'perdieron', 'elimina*', 'se clasifica*', 'campeon*', 'victoria*', 'triunfo*', 'paliza', 'barre',
  'barren', 'barrida', 'sentencia*', 'se impone', 'se imponen', 'supera', 'superan', 'doblega*', 'aplasta*', 'tumba', 'tumban', 'vapulea*',
  'racha', 'prorroga', 'remontada', 'conquista', 'conquistan', 'conquisto', 'campanada', 'salva a', 'salvan a', 'anillo', 'titulo', 'mvp de las finales', 'exhibicion de', 'brilla', 'lidera el triunfo',
]);

export function isSpoilerText(text, extraWords = []) {
  const t = normalize(text ?? '');
  if (!t) return false;
  if (PATTERNS.some((re) => re.test(t))) return true;
  if (RESULT_WORDS.some((re) => re.test(t))) return true;
  return extraWords.some((w) => w && t.includes(normalize(w)));
}

export const isNbaStory = (story) => (story.sections ?? []).includes('eeuu/nba');

// Only NBA stories are checked: "Lula wins" is news, "Warriors win" is a spoiler.
export function isSpoiler(story, extraWords = []) {
  if (!isNbaStory(story)) return false;
  const texts = [story.title, story.summary, story.aiSummary, ...(story.sources ?? []).map((s) => s.title)];
  return texts.some((t) => isSpoilerText(t, extraWords));
}
