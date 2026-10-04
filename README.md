# Mi Diario

Agregador de noticias personal y gratuito: recoge noticias de ~40 medios fiables (España, internacional, ciencia, física e innovación), agrupa la misma historia contada por varios medios, la ordena según tus intereses y genera resúmenes con IA. Se usa como web o se instala como app (PWA).

👉 El análisis completo de viabilidad, costes y aspectos legales está en [`docs/estudio-viabilidad.md`](docs/estudio-viabilidad.md).

## Cómo funciona

```
GitHub Actions (cada 2 h)
  └─ npm run ingest
       1. descarga los RSS de sources.json
       2. limpia, deduplica y clasifica por temas
       3. agrupa la misma noticia entre medios
       4. Gemini (gratis): resumen de las ~25 más relevantes + briefing
       5. escribe web/data/news.json
  └─ despliega web/ en Cloudflare Pages

Navegador (web/)
  carga news.json → ordena con tu perfil (localStorage) → feed "Para ti"
```

| Ruta | Qué es |
|---|---|
| `sources.json` | Lista de medios y feeds (añadir/quitar fuentes aquí) |
| `scripts/ingest/` | Descarga, parseo, clasificación, agrupación y resúmenes IA |
| `web/` | La web/PWA estática (sin build) |
| `web/lib/rank.js` | Algoritmo de personalización y aprendizaje |
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
2. **Cloudflare:** crea una cuenta gratuita y, una sola vez, el proyecto de Pages:
   `npx wrangler login && npx wrangler pages project create mi-diario --production-branch=main`
   Luego crea un API token con permiso *Cloudflare Pages: Edit*.
3. **En GitHub → Settings → Secrets and variables → Actions:**
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GEMINI_API_KEY`
   - Variables (opcionales): `SITE_URL` (p. ej. `https://mi-diario.pages.dev`, para reaprovechar resúmenes si falla la IA), `GEMINI_MODEL`, `CF_PAGES_PROJECT`
4. Fusiona en `main`. El workflow *Actualizar noticias* se ejecuta cada 2 horas (y a mano desde la pestaña Actions).
5. Abre la web en el móvil → menú del navegador → **"Añadir a pantalla de inicio" / "Instalar app"**.

## Personalización

- **Configuración inicial:** eliges temas e idiomas.
- **Ajustes:** peso de cada tema (de *Ocultar* a *Me encanta*), medios favoritos o silenciados, palabras clave a potenciar o silenciar.
- **Aprendizaje:** lo que abres, guardas, marcas con 👍/👎 u ocultas ajusta el orden. Se puede ver lo aprendido y borrarlo en Ajustes.
- El perfil se guarda solo en tu navegador; se puede exportar e importar para llevarlo a otro dispositivo.
