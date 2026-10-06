// Which stories go to the AI, and in which call: the portada (whole paper) plus every section
// of the taxonomy, and the NBA on its own.

import { SECTIONS } from '../../web/lib/taxonomy.js';
import { isNbaStory } from '../../web/lib/spoilers.js';

export const PORTADA_STORIES = 12;
export const SECTION_STORIES = 8;

export function importance(story, now) {
  const ageH = story.publishedAt ? (now - Date.parse(story.publishedAt)) / 3.6e6 : 48;
  return story.sources.length * 2 + Math.max(0, 24 - ageH) / 6;
}

export const inSection = (story, sec) => story.sections.some((s) => s === sec || s.startsWith(`${sec}/`));

// Spoiler stories never reach the model. NBA stories only go to the NBA call, the one with the
// no-spoiler rules: they also sit in EE. UU. and Deportes, and a summary written there could
// reveal a result (and would win, since earlier jobs take precedence).
export function aiJobs(stories, now) {
  const ranked = stories.filter((s) => !s.spoiler).sort((a, b) => importance(b, now) - importance(a, now));
  const general = ranked.filter((s) => !isNbaStory(s));
  const jobs = [{ id: 'portada', label: 'Portada', nba: false, stories: general.slice(0, PORTADA_STORIES) }];
  for (const sec of SECTIONS) {
    jobs.push({ id: sec.id, label: sec.label, nba: false, stories: general.filter((s) => inSection(s, sec.id)).slice(0, SECTION_STORIES) });
  }
  jobs.push({ id: 'eeuu/nba', label: 'NBA', nba: true, stories: ranked.filter(isNbaStory).slice(0, SECTION_STORIES) });
  return jobs.filter((j) => j.stories.length >= 2);
}
