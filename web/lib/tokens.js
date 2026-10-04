// Shared by the ingest script (Node) and the web app (browser).

export function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const STOPWORDS = new Set(`
a al algo ante antes como con contra cual cuando de del desde donde durante e el ella ellos en entre era es esa ese eso esta este esto estos fue fueron ha han hasta hay la las le les lo los mas me mi muy no nos o otra otro para pero por que quien se segun ser si sin sobre su sus tambien tras un una uno unos y ya
the of and to in for on with at by from as is are was were be been it its this that these those an or not but has have had will would can could after over into about than more new says said how why what who when where up out his her their they he she we you our
`.split(/\s+/).filter(Boolean));

export function tokens(s) {
  return normalize(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}
