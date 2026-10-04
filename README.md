# Mi Diario

Agregador de noticias personal y gratuito: recoge noticias de ~40 medios fiables (España, internacional, ciencia, física e innovación), agrupa la misma historia contada por varios medios, la ordena según tus intereses y genera resúmenes con IA. Se usa como web o se instala como app (PWA).

👉 El análisis completo de viabilidad, costes y aspectos legales está en [`docs/estudio-viabilidad.md`](docs/estudio-viabilidad.md).

## Cómo funciona

```
GitHub Actions (cada 2 h)
  └─ npm run ingest
       1. descarga los RSS de sources.json
       2. limpia, deduplica y clasifica en secciones/subsecciones
       3. agrupa la misma noticia entre medios y marca spoilers de la NBA
       4. Gemini (gratis): un briefing por sección + resúmenes de sus noticias top
       5. escribe web/data/news.json
  └─ despliega en Cloudflare Workers: web/ (assets) + src/worker.js (API de sincronización, KV)

Navegador (web/)
  carga news.json → ordena con tu perfil (algoritmo que aprende de tus ❤️) → feeds
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
| `test/` | Tests (`npm test`) |

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
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GEMINI_API_KEY`
   - Variables (opcionales): `SITE_URL` (la URL final, p. ej. `https://mi-diario.<tu-subdominio>.workers.dev`, para reaprovechar resúmenes si falla la IA) y `GEMINI_MODEL` (por defecto se usan los alias `gemini-flash-latest` → `gemini-flash-lite-latest`).
4. El workflow *Actualizar noticias* se ejecuta en la rama por defecto del repo cada 2 horas, en cada push y a mano desde la pestaña *Actions → Actualizar noticias → Run workflow*.
5. Abre la web en el móvil → menú del navegador → **"Añadir a pantalla de inicio" / "Instalar app"**.

## Secciones

Para ti · España (Política, Economía, Sociedad, Deportes, Cultura) · EE. UU. (Política, Economía, Sociedad, NBA) · Internacional (Europa, Latinoamérica, Oriente Medio, Asia y otros) · Ciencia (Física, Espacio, Vida y salud, Clima) · Tecnología (IA, Empresas y gadgets, Innovación) · Economía (Mercados, Empresas, Energía).

Cada sección tiene su resumen IA arriba (y la NBA uno propio, sin resultados). Las rutas se pueden enlazar: `#/s/eeuu/nba`.

## Cómo aprende

- **❤️ Me gusta**, **Guardar** y **abrir** una noticia son señales positivas; **👎** y **Ocultar**, negativas. Si una noticia te aparece arriba en 3 visitas distintas y nunca la abres, cuenta como un "no" suave (solo para su sección y medio).
- Cada noticia se describe con rasgos: sección y subsección, medio, palabras y pares de palabras del titular y nombres propios ("Golden State", "CERN"). Un modelo de **regresión logística online** ajusta el peso de cada rasgo con cada señal; lo aprendido se va olvidando un 3 % al día.
- Orden final = tu preferencia por la sección (Ajustes) + lo aprendido + nº de medios que la cubren + frescura, con diversidad de temas y, en Para ti, 1 de cada 10 noticias "para descubrir" fuera de lo habitual.
- Cada tarjeta dice por qué te la enseña (♥ NBA · Física) y en Ajustes puedes ver y olvidar lo aprendido.

## Sin spoilers de la NBA

Las noticias de la NBA con marcadores, "X gana a Y", estadísticas de partido o eliminatorias aparecen tapadas ("Posible spoiler · Mostrar") en todos los feeds. Nunca se envían a la IA, y el resumen de la NBA tiene prohibido dar resultados (con un filtro posterior). Se puede desactivar o añadir palabras en Ajustes.

## Sincronizar móvil y PC

Ajustes → *Sincronizar dispositivos* → *Activar* y abre el enlace en el otro dispositivo. El perfil se guarda en Cloudflare KV (gratis) bajo un código aleatorio de 128 bits; se sube como mucho cada 15 s y se descarga al abrir la web. El perfil también se puede exportar/importar como archivo.
