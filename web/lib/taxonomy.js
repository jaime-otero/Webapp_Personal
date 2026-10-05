// Sections, subsections and the keyword groups used to classify news. Shared by the ingest
// script (Node) and the web app (browser).
//
// Keywords are accent-free and lowercase (ES + EN). A trailing '*' matches as a prefix.

import { normalize } from './tokens.js';

export const SECTIONS = [
  { id: 'espana', label: 'España', subs: [['politica', 'Política'], ['economia', 'Economía'], ['sociedad', 'Sociedad'], ['deportes', 'Deportes'], ['cultura', 'Cultura']] },
  { id: 'eeuu', label: 'EE. UU.', subs: [['politica', 'Política'], ['economia', 'Economía'], ['sociedad', 'Sociedad'], ['nba', 'NBA'], ['nfl', 'NFL'], ['universitario', 'Deporte universitario']] },
  { id: 'internacional', label: 'Internacional', subs: [['europa', 'Europa'], ['latam', 'Latinoamérica'], ['oriente-medio', 'Oriente Medio'], ['asia', 'Asia y otros']] },
  { id: 'ciencia', label: 'Ciencia', subs: [['fisica', 'Física'], ['espacio', 'Espacio'], ['vida', 'Vida y salud'], ['clima', 'Clima']] },
  { id: 'tecnologia', label: 'Tecnología', subs: [['ia', 'IA'], ['empresas', 'Empresas y gadgets'], ['innovacion', 'Innovación']] },
  { id: 'economia', label: 'Economía', subs: [['mercados', 'Mercados'], ['empresas', 'Empresas'], ['energia', 'Energía']] },
  { id: 'deportes', label: 'Deportes', subs: [['futbol', 'Fútbol'], ['baloncesto', 'Baloncesto'], ['tenis', 'Tenis'], ['nfl', 'Fútbol americano'], ['rugby', 'Rugby'], ['beisbol', 'Béisbol'], ['invierno', 'Deportes de invierno'], ['atletismo', 'Atletismo'], ['ciclismo', 'Ciclismo'], ['resistencia', 'Resistencia'], ['motor', 'Motor'], ['combate', 'Combate'], ['acuaticos', 'Deportes acuáticos'], ['otros', 'Otros']] },
].map((s) => ({ ...s, subs: s.subs.map(([id, label]) => ({ id, key: `${s.id}/${id}`, label })) }));

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

// "espana/deportes" → "Deportes (España)"; "espana" → "España".
export function sectionLabel(key, { withParent = false } = {}) {
  const [sec, sub] = key.split('/');
  const s = SECTION_BY_ID[sec];
  if (!s) return key;
  if (!sub) return s.label;
  const label = s.subs.find((x) => x.id === sub)?.label ?? sub;
  return withParent ? `${label} · ${s.label}` : label;
}

export const NBA_TEAMS = [
  'nba', 'atlanta hawks', 'hawks', 'boston celtics', 'celtics', 'brooklyn nets', 'charlotte hornets', 'chicago bulls',
  'cleveland cavaliers', 'cavaliers', 'cavs', 'dallas mavericks', 'mavericks', 'mavs', 'denver nuggets', 'nuggets',
  'detroit pistons', 'pistons', 'golden state', 'warriors', 'houston rockets', 'indiana pacers', 'pacers', 'clippers',
  'lakers', 'memphis grizzlies', 'grizzlies', 'miami heat', 'milwaukee bucks', 'timberwolves', 't-wolves',
  'new orleans pelicans', 'pelicans', 'knicks', 'okc thunder', 'oklahoma city thunder', 'orlando magic', '76ers', 'sixers',
  'phoenix suns', 'trail blazers', 'sacramento kings', 'san antonio spurs', 'toronto raptors', 'raptors', 'utah jazz',
  'washington wizards',
];
export const NBA_PLAYERS = [
  'lebron', 'stephen curry', 'steph curry', 'luka doncic', 'doncic', 'jokic', 'antetokounmpo', 'giannis', 'wembanyama',
  'wemby', 'jayson tatum', 'embiid', 'kevin durant', 'gilgeous-alexander', 'shai gilgeous', 'anthony edwards',
  'ja morant', 'kawhi leonard', 'jimmy butler', 'devin booker', 'jalen brunson', 'tyrese haliburton', 'santi aldama',
  'hugo gonzalez', 'cooper flagg', 'nikola jokic', 'paolo banchero', 'trae young', 'donovan mitchell',
];

export const KEYWORDS = {
  // Regions
  'r:espana': ['espana', 'espanol*', 'spain', 'spanish', 'madrid', 'barcelona', 'cataluna', 'catalunya', 'catalonia', 'andaluc*', 'comunitat valenciana', 'comunidad valenciana', 'galicia', 'pais vasco', 'euskadi', 'basque', 'aragon', 'canarias', 'baleares', 'murcia', 'extremadura', 'castilla', 'asturias', 'cantabria', 'navarra', 'la rioja', 'ceuta', 'melilla', 'feijoo', 'moncloa', 'generalitat', 'psoe', 'sumar', 'aemet'],
  'r:eeuu': ['estados unidos', 'eeuu', 'ee.uu', 'ee. uu', 'u.s.', 'united states', 'american', 'americans', 'washington', 'trump', 'biden', 'vance', 'white house', 'casa blanca', 'congress', 'senate', 'republican*', 'democrat*', 'gop', 'supreme court', 'pentagon', 'pentagono', 'fbi', 'wall street', 'new york', 'nueva york', 'california', 'texas', 'florida', 'chicago', 'los angeles', 'federal reserve', 'reserva federal'],
  'r:europa': ['europa', 'europe*', 'union europea', 'ue', 'eu', 'bruselas', 'brussels', 'ucrania', 'ukrain*', 'rusia', 'russia*', 'ruso', 'rusos', 'kremlin', 'putin', 'zelensk*', 'kyiv', 'kiev', 'moscu', 'moscow', 'alemania', 'german*', 'aleman', 'merz', 'francia', 'france', 'french', 'frances', 'macron', 'reino unido', 'britain', 'british', 'britanic*', 'starmer', 'london', 'londres', 'italia', 'italy', 'italian*', 'meloni', 'polonia', 'poland', 'portugal', 'grecia', 'greece', 'paises bajos', 'netherlands', 'dutch', 'belgica', 'belgium', 'suiza', 'switzerland', 'austria', 'hungria', 'hungary', 'orban', 'suecia', 'sweden', 'noruega', 'norway', 'dinamarca', 'denmark', 'finland*', 'irlanda', 'ireland', 'otan', 'nato', 'serbia', 'rumania', 'romania', 'chequia', 'czech', 'eslovaquia', 'slovakia'],
  'r:latam': ['latinoameric*', 'latin america*', 'brasil', 'brazil*', 'lula', 'bolsonaro', 'mexico', 'mexican*', 'mexicano*', 'sheinbaum', 'argentin*', 'milei', 'venezuela*', 'maduro', 'colombia*', 'petro', 'chile', 'chilean*', 'chileno*', 'peru', 'peruvian*', 'peruano*', 'cuba', 'cuban*', 'cubano*', 'ecuador*', 'bolivia*', 'paraguay*', 'uruguay*', 'honduras', 'guatemala*', 'el salvador', 'bukele', 'nicaragua*', 'panama', 'haiti*', 'dominican*', 'puerto rico'],
  'r:oriente-medio': ['oriente medio', 'oriente proximo', 'middle east', 'israel*', 'gaza', 'gazati*', 'palestin*', 'hamas', 'hezbola', 'hezbollah', 'netanyahu', 'cisjordania', 'west bank', 'iran', 'irani*', 'teheran', 'tehran', 'siria', 'syria*', 'libano', 'lebanon', 'lebanese', 'yemen*', 'huties', 'hutis', 'houthi*', 'arabia saudi', 'saudi*', 'riad', 'riyadh', 'aramco', 'irak', 'iraq*', 'qatar', 'catar', 'emiratos', 'uae', 'emirates', 'emirati*', 'dubai', 'flydubai', 'abu dabi', 'abu dhabi', 'jordan*', 'egipt*', 'egypt*', 'turquia', 'turkey', 'turkish', 'erdogan', 'kuwait', 'oman', 'bahrein', 'bahrain'],
  'r:asia': ['china', 'chinese', 'chino', 'chinos', 'chinas', 'xi jinping', 'beijing', 'pekin', 'taiwan*', 'japon', 'japones*', 'japan*', 'okinawa', 'tokio', 'tokyo', 'corea', 'coreano*', 'korea*', 'india', 'indian', 'modi', 'pakistan*', 'afganistan', 'afghan*', 'indonesia*', 'filipinas', 'philippine*', 'vietnam*', 'tailandia', 'thailand', 'thai', 'myanmar', 'birmania', 'bangladesh', 'australia*', 'nueva zelanda', 'new zealand', 'africa*', 'nigeria*', 'kenia', 'kenya*', 'sudafrica*', 'south africa*', 'sudan*', 'etiopia', 'ethiopia*', 'congo*', 'somalia*', 'mali', 'sahel', 'marruecos', 'marroqui*', 'morocco', 'moroccan', 'argelia', 'algeria*', 'libia', 'libya*', 'tunez', 'tunisia*'],

  // Subsections of España / EE. UU. (topic within a region)
  'politica-es': ['gobierno', 'congreso', 'senado', 'psoe', 'pp', 'vox', 'sumar', 'podemos', 'moncloa', 'pedro sanchez', 'sanchez', 'feijoo', 'abascal', 'yolanda diaz', 'ministr*', 'eleccion*', 'electoral', 'parlament*', 'generalitat', 'junts', 'puigdemont', 'erc', 'pnv', 'bildu', 'presupuestos', 'frente amplio', 'diputad*', 'alcalde*', 'alcaldesa', 'tribunal supremo', 'constitucional', 'fiscal general', 'partido popular', 'socialista*', 'oposicion'],
  'politica-us': ['trump', 'biden', 'harris', 'vance', 'white house', 'casa blanca', 'congress', 'congreso de ee', 'senate', 'senado de ee', 'senator*', 'senador*', 'republican*', 'republicano*', 'democrat*', 'democrata*', 'gop', 'supreme court', 'governor', 'gobernador*', 'election*', 'midterm*', 'impeachment', 'pentagon', 'pentagono', 'fbi', 'justice department', 'attorney general', 'immigration', 'inmigracion', 'deport*', 'shutdown', 'trump administration', 'administracion trump', 'czar', 'mamdani'],
  economia: ['economi*', 'inflacion', 'inflation', 'ipc', 'ibex', 'bolsa', 'empleo', 'paro', 'pib', 'gdp', 'banco', 'bancos', 'banca', 'bce', 'impuesto*', 'tax', 'taxes', 'hipoteca*', 'vivienda', 'alquiler*', 'salario*', 'pensiones', 'hacienda', 'arancel*', 'tariff*', 'wall street', 'fed', 'federal reserve', 'reserva federal', 'dow', 'nasdaq', 's&p', 'stocks', 'jobs report', 'unemployment', 'recession', 'recesion', 'treasury', 'deficit', 'deuda', 'debt', 'autonomos', 'beneficio*', 'profits', 'earnings', 'empresa*', 'company', 'companies'],
  sociedad: ['sanidad', 'sanitari*', 'educacion', 'colegio*', 'escuela*', 'school*', 'universidad*', 'universit*', 'muere', 'mueren', 'muerto*', 'muerte', 'fallec*', 'herido*', 'detenido*', 'arrest*', 'policia', 'police', 'guardia civil', 'accidente*', 'incendio*', 'wildfire*', 'temporal', 'lluvia*', 'dana', 'aemet', 'tormenta*', 'storm*', 'hurricane*', 'huracan*', 'flood*', 'inundac*', 'violencia', 'machista', 'juicio', 'trial', 'igualdad', 'inmigra*', 'migrante*', 'shooting', 'tiroteo*', 'crime', 'crimen', 'asesin*', 'murder*', 'killing', 'abortion', 'aborto', 'protest*', 'manifestac*', 'trafico', 'consumo', 'okupa*', 'desahucio*', 'asentamiento', 'ahogad*', 'drown*'],
  deportes: ['futbol', 'liga', 'laliga', 'champions', 'real madrid', 'barca', 'fc barcelona', 'atletico', 'betis', 'sevilla fc', 'athletic', 'valencia cf', 'tenis', 'alcaraz', 'nadal', 'formula 1', 'f1', 'fernando alonso', 'carlos sainz', 'motogp', 'marc marquez', 'ciclismo', 'la vuelta', 'tour de francia', 'baloncesto', 'acb', 'euroliga', 'euroleague', 'seleccion espanola', 'balonmano', 'olimpi*', 'futbolista*', 'entrenador', 'gol', 'goles', 'fichaje*', 'derbi', 'football', 'soccer', 'premier league'],
  cultura: ['cine', 'pelicula*', 'film', 'films', 'libro*', 'novela*', 'book*', 'musica', 'music', 'concierto*', 'concert*', 'museo*', 'museum*', 'arte', 'exposicion', 'festival', 'teatro', 'theatre', 'escritor*', 'writer*', 'cantante*', 'singer', 'album', 'disco', 'premio planeta', 'premio nobel de literatura', 'oscar*', 'goya', 'netflix', 'hbo'],
  nba: [...NBA_TEAMS, ...NBA_PLAYERS],

  // Ciencia
  ciencia: ['cientific*', 'ciencia', 'science', 'investigador*', 'scientist*', 'researcher*', 'estudio cientifico', 'study finds', 'new study', 'biolog*', 'quimic*', 'chemistr*', 'nobel', 'nobel de medicina', 'nobel de fisiologia', 'nobel en fisiologia', 'nobel de fisica', 'nobel de quimica', 'nobel prize in physics', 'nobel prize in chemistry', 'nobel prize in physiology', 'nobel prize in medicine', 'physics nobel', 'chemistry nobel', 'medicine nobel', 'paleontolog*', 'arqueolog*', 'archaeolog*'],
  fisica: ['fisic*', 'physic*', 'cuantic*', 'quantum', 'particula', 'particulas', 'particle*', 'cern', 'boson', 'neutrino*', 'laser*', 'superconduct*', 'relatividad', 'relativity', 'materia oscura', 'dark matter', 'fusion nuclear', 'nuclear fusion', 'plasma', 'foton*', 'photon*', 'qubit*', 'gravitational wave*', 'ondas gravitacionales', 'collider', 'acelerador de particulas', 'atomo*', 'atom', 'atoms', 'atomic', 'electron', 'electrons', 'electrones', 'magnet*', 'optic*', 'topolog*'],
  espacio: ['nasa', 'agencia espacial europea', 'european space agency', 'agencia espacial', 'space agency', 'spacex', 'starship', 'cohete espacial', 'rocket*', 'satelite*', 'satellite*', 'galaxia*', 'galax*', 'agujero negro', 'black hole*', 'telescopio', 'telescope', 'james webb', 'hubble', 'marte', 'mars', 'lunar', 'moon', 'asteroide*', 'asteroid*', 'exoplanet*', 'astronom*', 'astronaut*', 'artemis', 'orbit*', 'cosmic', 'cosmos', 'universo', 'universe', 'supernova*', 'apod'],
  vida: ['salud', 'health', 'cancer', 'vacuna*', 'vaccine*', 'enfermedad*', 'disease*', 'virus', 'pandemia', 'medicina', 'medicine', 'medical', 'farmac*', 'alzheimer', 'genetic*', 'genoma', 'genome', 'dna', 'adn', 'teoria de la evolucion', 'evolutionary', 'fosil*', 'fossil*', 'dinosaur*', 'neuro*', 'cerebro', 'brain*', 'cell', 'cells', 'celula*', 'bacteria*', 'especies', 'species', 'animal*', 'wildlife', 'biodiversidad', 'biodiversity', 'ecolog*'],
  clima: ['cambio climatico', 'climate', 'calentamiento global', 'global warming', 'emisiones', 'emission*', 'co2', 'carbono', 'carbon', 'renovable*', 'renewable*', 'deshielo', 'glaciar*', 'glacier*', 'ice sheet', 'sequia', 'drought', 'ola de calor', 'heatwave', 'ocean warming'],

  // Tecnología
  tecnologia: ['tecnolog*', 'technolog*', 'tech', 'internet', 'software', 'hardware', 'ordenador*', 'computer*', 'ciberataque*', 'ciberseguridad', 'cyber*', 'hacker*'],
  ia: ['inteligencia artificial', 'ia', 'ai', 'a.i.', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini', 'llm', 'machine learning', 'aprendizaje automatico', 'deepmind', 'chatbot*', 'generative', 'generativa', 'agi', 'deepseek', 'copilot'],
  'tec-empresas': ['apple', 'iphone', 'google', 'alphabet', 'microsoft', 'amazon', 'meta platforms', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'tesla', 'nvidia', 'samsung', 'xiaomi', 'intel', 'amd', 'netflix', 'spotify', 'smartphone*', 'movil', 'moviles', 'android', 'ios', 'gadget*', 'consola*', 'console*', 'playstation', 'nintendo', 'xbox', 'portatil*', 'laptop*', 'musk', 'zuckerberg', 'startup*'],
  innovacion: ['innovaci*', 'innovation', 'invento*', 'invent*', 'robot*', 'chip', 'chips', 'semiconductor*', 'bateria*', 'batter*', 'computacion cuantica', 'quantum comput*', 'impresion 3d', '3d print*', 'drone*', 'dron', 'drones', 'coche electrico', 'electric vehicle*', 'ev', 'autonom*', 'self-driving', 'biotech*', 'prototipo*', 'prototype*', 'patente*', 'patent*', 'breakthrough'],

  // Economía (mundo)
  mercados: ['bolsa*', 'ibex', 'wall street', 'dow jones', 'nasdaq', 's&p', 'stocks', 'stock market', 'mercado*', 'market*', 'bonos', 'bond*', 'tipos de interes', 'interest rate*', 'bce', 'fed', 'reserva federal', 'federal reserve', 'divisa*', 'euro', 'dolar', 'dollar', 'bitcoin', 'cripto*', 'crypto*', 'inversor*', 'investor*', 'acciones', 'shares', 'inflacion', 'inflation'],
  'eco-empresas': ['empresa*', 'compan*', 'beneficio*', 'profit*', 'earnings', 'resultados trimestrales', 'ventas', 'sales', 'facturacion', 'fusion', 'merger*', 'adquisicion*', 'acquisition*', 'opa', 'takeover', 'despido*', 'layoff*', 'ere', 'ceo', 'consejero delegado', 'quiebra', 'bankrupt*', 'ipo', 'salida a bolsa', 'multinacional*', 'inditex', 'telefonica', 'santander', 'bbva', 'iberdrola', 'repsol'],
  energia: ['energia', 'energy', 'petroleo', 'oil', 'crudo', 'gas', 'gasolina', 'gasoline', 'electricidad', 'electricity', 'precio de la luz', 'factura de la luz', 'opep', 'opec', 'renovable*', 'renewable*', 'energia solar', 'solar power', 'placas solares', 'paneles solares', 'solar panel*', 'eolic*', 'wind power', 'energia nuclear', 'nuclear power', 'central nuclear', 'centrales nucleares', 'nuclear plant*', 'hidrogeno', 'hydrogen', 'apagon', 'blackout', 'red electrica', 'iberdrola', 'endesa', 'repsol', 'aramco'],

  // Deportes (mundo)
  deporte: ['deporte', 'deportes', 'deportista*', 'sport', 'sports', 'olimpi*', 'olympic*', 'juegos olimpicos', 'campeonato del mundo', 'world championship*', 'medalla*', 'medallist*', 'medalist*', 'campeonato de europa', 'european championship*'],
  'dep-futbol': ['futbol', 'futbolista*', 'soccer', 'laliga', 'la liga', 'champions league', 'champions', 'europa league', 'conference league', 'premier league', 'bundesliga', 'ligue 1', 'serie a', 'mundial de clubes', 'club world cup', 'fifa', 'uefa', 'real madrid', 'barca', 'fc barcelona', 'atletico de madrid', 'athletic club', 'betis', 'sevilla fc', 'valencia cf', 'villarreal', 'real sociedad', 'osasuna', 'celta', 'arsenal', 'liverpool', 'manchester city', 'manchester united', 'man utd', 'chelsea', 'tottenham', 'juventus', 'inter de milan', 'psg', 'paris saint-germain', 'bayern', 'mbappe', 'vinicius', 'lamine yamal', 'bellingham', 'haaland', 'messi', 'cristiano ronaldo', 'ancelotti', 'xabi alonso', 'simeone', 'guardiola', 'gol', 'goles', 'goleador*', 'penalti*', 'fichaje*', 'derbi', 'delantero*', 'portero*', 'striker*', 'goalkeeper*'],
  'dep-baloncesto': ['baloncesto', 'basket', 'basketball', 'baloncestista*', 'acb', 'liga endesa', 'euroliga', 'euroleague', 'eurobasket', 'wnba', 'ncaa basketball', 'march madness', 'unicaja', 'baskonia', 'valencia basket', 'canasta*', 'triple-doble', 'base titular', ...NBA_TEAMS, ...NBA_PLAYERS],
  'dep-tenis': ['tenis', 'tennis', 'tenista*', 'atp', 'wta', 'wimbledon', 'roland garros', 'us open', 'open de australia', 'australian open', 'copa davis', 'davis cup', 'billie jean king cup', 'masters 1000', 'grand slam', 'alcaraz', 'nadal', 'sinner', 'djokovic', 'zverev', 'medvedev', 'draper', 'sabalenka', 'swiatek', 'gauff', 'badosa', 'raducanu'],
  'dep-nfl': ['nfl', 'futbol americano', 'american football', 'super bowl', 'quarterback*', 'mariscal de campo', 'touchdown*', 'college football', 'kansas city chiefs', 'los chiefs', 'the chiefs', 'packers', 'steelers', '49ers', 'ravens', 'bengals', 'broncos', 'seahawks', 'buccaneers', 'raiders', 'dallas cowboys', 'mahomes', 'travis kelce', 'josh allen', 'lamar jackson', 'jalen hurts', 'joe burrow', 'aaron rodgers'],
  // College sports in the US (football and basketball).
  'dep-ncaa': ['ncaa', 'ncaaf', 'ncaab', 'college football', 'college basketball', 'college hoops', 'futbol americano universitario', 'baloncesto universitario', 'deporte universitario', 'march madness', 'ncaa tournament', 'final four de la ncaa', 'heisman', 'college football playoff', 'cfp', 'bowl game', 'rose bowl', 'sugar bowl', 'orange bowl', 'cotton bowl', 'big ten', 'big 12', 'transfer portal', 'nil deal*', 'red river rivalry', 'crimson tide', 'buckeyes', 'georgia bulldogs', 'wolverines', 'longhorns', 'fighting irish', 'blue devils', 'tar heels', 'kentucky wildcats', 'uconn huskies', 'gonzaga', 'jayhawks', 'clemson tigers', 'lsu tigers', 'oregon ducks', 'usc trojans'],
  'dep-rugby': ['rugby', 'six nations', 'seis naciones', 'all blacks', 'springboks', 'wallabies', 'los pumas', 'xv del leon', 'top 14', 'premiership rugby', 'super rugby', 'british and irish lions', 'rugby world cup', 'mundial de rugby'],
  'dep-beisbol': ['beisbol', 'baseball', 'mlb', 'serie mundial de beisbol', 'grandes ligas', 'pitcher*', 'lanzador*', 'bateador*', 'home run*', 'jonron*', 'yankees', 'dodgers', 'red sox', 'mets', 'cubs', 'astros', 'blue jays', 'phillies', 'braves', 'mariners', 'orioles', 'ohtani', 'aaron judge'],
  'dep-invierno': ['esqui', 'esquiador*', 'ski', 'skiing', 'skier*', 'snowboard*', 'biatlon', 'biathlon', 'esqui de fondo', 'cross-country skiing', 'saltos de esqui', 'ski jumping', 'eslalon', 'slalom', 'patinaje', 'figure skating', 'speed skating', 'hockey sobre hielo', 'ice hockey', 'nhl', 'curling', 'bobsleigh', 'skeleton', 'luge', 'juegos olimpicos de invierno', 'winter olympics', 'milano cortina', 'shiffrin', 'odermatt', 'deportes de invierno', 'winter sports'],
  'dep-atletismo': ['atletismo', 'athletics', 'track and field', 'diamond league', 'liga de diamante', 'velocista*', 'sprinter*', '100 metros', '100m', 'vallas', 'hurdles', 'salto de altura', 'high jump', 'salto de longitud', 'long jump', 'triple salto', 'triple jump', 'pertiga', 'pole vault', 'lanzamiento de peso', 'shot put', 'jabalina', 'javelin', 'decatlon', 'decathlon', 'heptatlon', 'heptathlon', 'marcha atletica', 'duplantis', 'warholm', 'kipyegon', 'campo a traves', 'cross country'],
  'dep-ciclismo': ['ciclismo', 'ciclista*', 'cycling', 'cyclist*', 'tour de francia', 'tour de france', 'la vuelta', 'vuelta a espana', 'giro de italia', "giro d'italia", 'paris-roubaix', 'milan-san remo', 'tour de flandes', 'mundial de ciclismo', 'uci', 'peloton', 'contrarreloj', 'time trial', 'gravel', 'mountain bike', 'btt', 'pogacar', 'vingegaard', 'evenepoel', 'van der poel', 'van aert', 'roglic', 'juan ayuso', 'enric mas', 'visma', 'uae team emirates', 'ineos', 'movistar team'],
  'dep-resistencia': ['triatlon', 'triathlon', 'triatleta*', 'triathlete*', 'ironman', 'kona', 'duatlon', 'duathlon', 'maraton', 'maratones', 'marathon*', 'maratoniano*', 'media maraton', 'half marathon', 'ultramaraton*', 'ultramarathon*', 'ultra trail', 'ultratrail', 'trail running', 'utmb', 'western states', 'hyrox', 'kipchoge', 'natacion en aguas abiertas', 'open water swim*', 'travesia a nado'],
  'dep-motor': ['formula 1', 'formula one', 'f1', 'gran premio', 'grand prix', 'motogp', 'moto2', 'moto3', 'superbike*', 'rallye*', 'mundial de rallies', 'rally dakar', 'dakar', 'wrc', 'indycar', 'nascar', 'le mans', 'endurance wec', 'formula e', 'piloto*', 'fernando alonso', 'carlos sainz', 'verstappen', 'hamilton', 'leclerc', 'norris', 'piastri', 'russell', 'aston martin', 'red bull racing', 'ferrari', 'mclaren', 'williams', 'marc marquez', 'alex marquez', 'bagnaia', 'pecco', 'jorge martin', 'pedro acosta', 'fermin aldeguer', 'ducati', 'ktm', 'aprilia', 'paddock', 'parrilla de salida', 'pole position', 'pit stop', 'circuito de'],
  'dep-combate': ['boxeo', 'boxing', 'boxeador*', 'boxer', 'boxers', 'ufc', 'mma', 'artes marciales mixtas', 'mixed martial arts', 'kickboxing', 'muay thai', 'judo', 'judoka*', 'karate', 'taekwondo', 'lucha libre', 'wrestling', 'esgrima', 'fencing', 'welterweight*', 'cinturon mundial', 'world title fight', 'ilia topuria', 'topuria', 'canelo', 'usyk', 'tyson fury', 'anthony joshua', 'jake paul', 'jon jones', 'sandor martin', 'nocaut', 'knockout', 'ko tecnico'],
  'dep-acuaticos': ['natacion', 'nadador*', 'swimming', 'swimmer*', 'waterpolo', 'water polo', 'saltos de trampolin', 'diving', 'natacion artistica', 'artistic swimming', 'mundial de natacion', 'vela', 'regata*', 'sailing', 'regatta*', 'sailgp', "america's cup", 'copa america de vela', 'ocean race', 'vendee globe', 'surf', 'surfing', 'surfista*', 'surfer*', 'remo', 'rowing', 'piraguismo', 'canoe*', 'kayak*', 'windsurf*', 'kitesurf*', 'leon marchand', 'marchand', 'ledecky', 'mireia belmonte', 'hugo gonzalez de oliveira', 'saul craviotto'],
  'dep-otros': ['golf', 'golfista*', 'golfer*', 'pga', 'liv golf', 'ryder cup', 'masters de augusta', 'the masters', 'open britanico', 'the open championship', 'jon rahm', 'scheffler', 'rory mcilroy', 'balonmano', 'handball', 'liga asobal', 'padel', 'premier padel', 'world padel tour', 'arturo coello', 'agustin tapia', 'ale galan', 'juan lebron', 'ari sanchez', 'paula josemaria'],
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&');

// Word boundaries that also work with ñ and other non-ASCII letters (\b is ASCII-only).
const B = '(?<![a-z0-9ñ])';
const E = '(?![a-z0-9ñ])';

export function compileKeywords(words) {
  return words.map((w) => (w.endsWith('*') ? new RegExp(`${B}${escape(w.slice(0, -1))}`) : new RegExp(`${B}${escape(w)}${E}`)));
}

const COMPILED = Object.fromEntries(Object.entries(KEYWORDS).map(([k, words]) => [k, compileKeywords(words)]));

// Score every keyword group: 2 per keyword found in the title, 1 if only in the body.
export function scoreGroups(title, body = '') {
  const t = normalize(title);
  const b = normalize(body);
  const scores = {};
  for (const [group, regexes] of Object.entries(COMPILED)) {
    let score = 0;
    for (const re of regexes) {
      if (re.test(t)) score += 2;
      else if (re.test(b)) score += 1;
    }
    if (score) scores[group] = score;
  }
  return scores;
}
