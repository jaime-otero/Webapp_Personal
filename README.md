# Mi Diario

Agregador de noticias personal y gratuito: recoge noticias de ~40 medios fiables (España, internacional, ciencia, física e innovación), agrupa la misma historia contada por varios medios, la ordena según tus intereses y genera resúmenes con IA. Se usa como web o se instala como app (PWA).

👉 El análisis completo de viabilidad, costes y aspectos legales está en [`docs/estudio-viabilidad.md`](docs/estudio-viabilidad.md).

## Cómo funciona

```
GitHub Actions (cada hora de 7 a 24 h, dos veces de madrugada; IA cada 2 h)
  └─ npm run ingest
       1. descarga los RSS de sources.json
       2. limpia, deduplica y clasifica en secciones/subsecciones
       3. agrupa la misma noticia entre medios y marca spoilers de la NBA
       4. Gemini (gratis; de reserva Groq y GitHub Models): un briefing por sección + resúmenes de sus noticias top
       5. escribe web/data/news.json
  └─ despliega en Cloudflare Workers: web/ (assets) + src/worker.js (API de sincronización, KV)

Navegador (web/)
  carga news.json → ordena con tu perfil (algoritmo que aprende de tus ❤️) → feeds
  (o, si lo eliges arriba de la lista, por más recientes o por nº de medios)
```

| Ruta | Qué es |
|---|---|
| `sources.json` | Medios y feeds, cada uno con su sección por defecto (añadir/quitar fuentes aquí) |
| `web/lib/taxonomy.js` | Secciones, subsecciones y palabras clave para clasificar |
| `web/lib/spoilers.js` | Detector de resultados de la NBA |
| `src/worker.js` | Worker: sirve la web y guarda el perfil sincronizado (KV) |
| `scripts/ingest/` | Descarga, parseo, clasificación, agrupación y resúmenes IA |
| `web/` | La web/PWA estática (sin build) |
| `web/lib/rank.js` | Algoritmo de personalización (regresión logística online) |
| `web/lib/profile.js` | Perfil del usuario, migración y fusión al sincronizar |
| `test/` | Tests (`npm test`; el workflow *CI* los pasa en cada PR) |

## Probar en local

Requiere Node 20+.

```bash
npm install
npm run ingest            # genera web/data/news.json
GEMINI_API_KEY=xxx npm run ingest   # igual, con resúmenes IA
npm run dev               # abre http://localhost:5173
npm test
```

## Ponerla en internet (gratis)

1. **Clave de IA (opcional):** crea una API key en [Google AI Studio](https://aistudio.google.com/apikey).
2. **Cloudflare:** en *My Profile → API Tokens → Create Token*, usa la plantilla **"Edit Cloudflare Workers"** y copia el token. Copia también tu **Account ID** (aparece en la página de *Workers & Pages*). El worker `mi-diario` se crea solo en el primer despliegue.
3. **En GitHub → Settings → Secrets and variables → Actions:**
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GEMINI_API_KEY` y, como IA de reserva, `GROQ_API_KEY` (gratis en [console.groq.com/keys](https://console.groq.com/keys)): si Gemini falla, los resúmenes se hacen con Groq
   - Variables (opcionales): `SITE_URL` (la URL final, p. ej. `https://mi-diario.<tu-subdominio>.workers.dev`, para reaprovechar resúmenes si falla la IA) `GEMINI_MODEL` (por defecto los alias `gemini-flash-latest` → `gemini-flash-lite-latest`) `GROQ_MODEL` (por defecto `openai/gpt-oss-120b` → `llama-3.3-70b-versatile`) y `GITHUB_MODELS_MODEL` (por defecto `openai/gpt-4.1-mini` → `openai/gpt-4o-mini`).
   - **GitHub Models** es la última reserva y no necesita clave: el workflow usa su propio `GITHUB_TOKEN` (permiso `models: read`). Para probarla, *Run workflow* con la IA `github`.
4. El workflow *Actualizar noticias* se ejecuta en la rama por defecto del repo cada hora de 7:00 a 24:00 (hora de España) y dos veces de madrugada, en cada push y a mano desde *Actions → Actualizar noticias → Run workflow*. Los resúmenes IA se regeneran cada 2 h; en las horas intermedias entran noticias nuevas y se conservan los resúmenes anteriores. Con la web abierta, cada 10 min comprueba `data/meta.json` y, si hay edición nueva, muestra el botón "Hay noticias nuevas · Actualizar".
5. Abre la web en el móvil → menú del navegador → **"Añadir a pantalla de inicio" / "Instalar app"**.

### Solo para quien invites (inicio de sesión)

La web puede pedir un **código de invitación**: cada persona tiene el suyo, lo escribe una vez y queda dentro (la sesión dura más de un año en ese dispositivo). Cada código es una cuenta: sus gustos se guardan en la nube y le siguen a cualquier dispositivo donde entre.

1. En Cloudflare, *Workers & Pages → mi-diario → Settings → Variables and Secrets → Add*, tipo **Secret**, nombre `INVITES` y como valor un `nombre:código` por persona, separados por comas:
   ```
   jaime:sol-mesa-rio-47, ana:luna-pan-verde-12, pepe:tren-azul-casa-83
   ```
   Usa códigos largos e inventados (3-4 palabras y un número). El secreto no está en el repo, así que puede ser público.
2. Pásale a cada amigo la URL de la web y **su** código.
3. Para invitar a alguien, añade su `nombre:código`; para quitarle el acceso, borra su entrada (o cámbiale el código).

Sin `INVITES` la web está abierta a cualquiera, como antes. El workflow sigue funcionando igual: guarda la edición anterior en la caché de Actions en vez de descargarla de la web.

## Protección y seguridad del repo

- **CI** (`.github/workflows/ci.yml`): pasa `npm test` en cada pull request.
- **Regla para `main`** (`.github/rulesets/main.json`): en *Settings → Rules → Rulesets → New ruleset → Import a ruleset*, sube ese archivo. Exige que los cambios a `main` lleguen por PR con los *Tests* en verde y prohíbe borrarla o reescribir su historia. Como admin puedes saltártela en una emergencia (casilla *bypass* al fusionar).
- **Dependabot** (`.github/dependabot.yml`): PRs semanales para actualizar dependencias npm y actions. Activa también las alertas en *Settings → Code security → Dependabot alerts*.
- **CodeQL** (`.github/workflows/codeql.yml`): análisis de seguridad del código en cada PR y cada lunes; los avisos salen en *Security → Code scanning*.
- **Secretos:** en *Settings → Code security*, comprueba que *Secret scanning* y *Push protection* están activados: bloquean un push que lleve una clave de Gemini, Groq o Cloudflare.

## Hazte tu propia copia

1. En la página del repo pulsa **Use this template → Create a new repository** (o *Fork*). Puede ser privado o público.
2. **Base de datos de sincronización (KV):** el `id` de `wrangler.jsonc` es el de mi cuenta y en la tuya no existe. En Cloudflare ve a *Storage & Databases → KV → Create* (nombre, p. ej., `mi-diario-profiles`), copia su **ID** y sustitúyelo en `wrangler.jsonc` (se puede editar desde la web de GitHub con el lápiz ✏️).
3. Sigue los pasos de [Ponerla en internet](#ponerla-en-internet-gratis): tus propios secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GEMINI_API_KEY` (y `GROQ_API_KEY` si quieres) y la variable `SITE_URL` con tu URL (`https://mi-diario.<tu-subdominio>.workers.dev`).
4. En la pestaña **Actions** de tu repo, activa los workflows si GitHub lo pide y lanza *Actualizar noticias → Run workflow*. En los forks GitHub desactiva las ejecuciones programadas hasta que las activas a mano.
5. Para personalizarla: añade o quita medios en `sources.json` y ajusta secciones y palabras clave en `web/lib/taxonomy.js`.

## Secciones

Para ti · España (Política, Economía, Sociedad, Deportes, Cultura) · EE. UU. (Política, Economía, Sociedad, NBA, NFL, Deporte universitario) · Internacional (Europa, Latinoamérica, Oriente Medio, Asia y otros) · Ciencia (Física, Espacio, Vida y salud, Clima) · Tecnología (IA, Empresas y gadgets, Innovación) · Economía (Mercados, Empresas, Energía) · Deportes (Fútbol, Baloncesto, Tenis, Fútbol americano, Rugby, Béisbol, Deportes de invierno, Atletismo, Ciclismo, Resistencia, Motor, Combate, Deportes acuáticos, Otros).

Cada sección tiene su resumen IA arriba (y la NBA uno propio, sin resultados). Las rutas se pueden enlazar: `#/s/eeuu/nba`.

## Cómo aprende

- **❤️ Me gusta**, **Guardar** y **abrir** una noticia son señales positivas; **👎** y **Ocultar**, negativas. Si una noticia te aparece arriba en 3 visitas distintas y nunca la abres, cuenta como un "no" suave (solo para su sección y medio).
- Cada noticia se describe con rasgos: sección y subsección, medio, palabras y pares de palabras del titular y nombres propios ("Golden State", "CERN"). Un modelo de **regresión logística online** ajusta el peso de cada rasgo con cada señal; lo aprendido se va olvidando un 3 % al día.
- Orden final = tu preferencia por la sección (Ajustes) + lo aprendido + nº de medios que la cubren + frescura, con diversidad de temas y, en Para ti, 1 de cada 10 noticias "para descubrir" fuera de lo habitual.
- Cada tarjeta dice por qué te la enseña (♥ NBA · Física) y en Ajustes puedes ver y olvidar lo aprendido.

## Sin spoilers de la NBA

Las noticias de la NBA con marcadores, "X gana a Y", estadísticas de partido o eliminatorias aparecen tapadas ("Posible spoiler · Mostrar") en todos los feeds. Nunca se envían a la IA, y el resumen de la NBA tiene prohibido dar resultados (con un filtro posterior). Se puede desactivar o añadir palabras en Ajustes.

## Sincronizar móvil y PC

Con inicio de sesión no hace falta nada: entra con tu código en cada dispositivo. Sin él: Ajustes → *Sincronizar dispositivos* → *Activar* y abre el enlace en el otro dispositivo. El perfil se guarda en Cloudflare KV (gratis) bajo un código aleatorio de 128 bits; se sube como mucho cada 15 s y se descarga al abrir la web. El perfil también se puede exportar/importar como archivo.
