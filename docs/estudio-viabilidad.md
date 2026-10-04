# Estudio de viabilidad: web/app de noticias personalizada y gratuita

*Octubre de 2026*

## Conclusión

**Es viable y puede costar 0 €**, tanto para uso personal como, con algunas precauciones legales, para abrirla al público más adelante. La clave es no depender de APIs de noticias de pago: casi todos los medios serios publican **feeds RSS** oficiales y gratuitos, pensados precisamente para que lectores y agregadores los consuman.

Este repositorio ya contiene un primer prototipo funcional (ver `README.md`).

## 1. ¿De dónde salen las noticias?

| Opción | Coste | Veredicto |
|---|---|---|
| **RSS oficiales de los medios** | Gratis | ✅ Elegida. Titular, extracto, imagen, fecha y enlace. Estable y legal. |
| The Guardian Open Platform, NYT API | Gratis con clave (cuotas, uso no comercial) | ➕ Complemento opcional; sus RSS ya bastan. |
| GDELT | Gratis | Útil para análisis masivo, demasiado ruidoso para un diario personal. |
| NewsAPI.org, GNews, Currents… | Free tier muy limitado | ❌ NewsAPI solo permite el plan gratis en `localhost` y con retraso. |
| *Scraping* de webs | Gratis | ❌ Frágil y legalmente arriesgado. |

**Fuentes validadas (41 feeds, 40 funcionando en la prueba del 4/10/2026):**

- **España:** El País (portada, internacional, economía, ciencia), El Mundo, RTVE, elDiario.es, La Vanguardia, Europa Press, 20minutos, ABC, El Confidencial, Expansión.
- **Internacional:** BBC News, BBC Mundo, The Guardian, The New York Times, Al Jazeera, DW, France 24.
- **Ciencia, física e innovación:** Agencia SINC, Naukas, Muy Interesante, Quanta Magazine, Physics World, Phys.org (física), CERN, Nature, Science, New Scientist, ScienceDaily, BBC Science, The Guardian Science, ESA, NASA, MIT Technology Review, IEEE Spectrum, Ars Technica, Wired Science, Xataka, Hipertextual.

Limitaciones: **Reuters y AP no tienen RSS público** (se cuelan vía otros medios); **EFE** no ofrece RSS operativo; arXiv se descartó por ser demasiado técnico para un feed general. Los feeds cambian de URL de vez en cuando: el script informa de los que fallan para sustituirlos.

## 2. ¿Cómo se adapta a mis gustos?

Por capas, de menos a más sofisticado:

1. **Preferencias explícitas** (hecho): temas (España, Internacional, Política, Economía, Ciencia, Física, Espacio, Tecnología e innovación, Salud, Clima, Deportes, Cultura) con 5 niveles, idiomas, medios favoritos/silenciados y palabras clave a potenciar o silenciar.
2. **Aprendizaje implícito** (hecho): cada noticia que abres, guardas, marcas con 👍/👎 u ocultas ajusta el peso de las palabras de su titular y de sus temas. Lo aprendido se va olvidando poco a poco (3 % al día) para seguir tus intereses actuales.
3. **Señales editoriales** (hecho): si muchos medios cubren la misma noticia, sube; las noticias se agrupan para no ver la misma historia 6 veces; diversidad para que no copen la portada diez noticias del mismo tema.
4. **Recomendación semántica** (futuro): *embeddings* multilingües (p. ej. Cloudflare Workers AI o transformers.js en el navegador) para entender que “fusión nuclear” y “ITER” van juntos, incluso entre español e inglés.

Todo el perfil vive en el navegador (`localStorage`): no hace falta servidor, base de datos ni cuentas, y es privado. Se puede exportar/importar entre dispositivos.

## 3. Resúmenes con IA

- **Gemini API (Google AI Studio), plan gratuito**: una sola llamada por actualización (≈12/día) que resume las ~25 noticias más relevantes y redacta un *briefing* del momento. Muy por debajo de las cuotas gratuitas.
- Alternativas gratis: Cloudflare Workers AI (cuota diaria gratuita), Groq. De pago y baratas: Claude Haiku, GPT‑mini.
- Ojo: en el plan gratuito de Gemini, Google puede usar las peticiones para mejorar sus modelos. Aquí solo se envían titulares públicos, así que no es un problema.
- La IA solo resume **titulares y extractos** que ya publica el RSS (no el artículo completo), siempre muestra la etiqueta “IA” y enlaza a las fuentes.

## 4. Infraestructura gratuita

| Pieza | Servicio | Límite gratuito | Uso previsto |
|---|---|---|---|
| Actualización periódica | GitHub Actions (cron) | Repo privado: 2.000 min/mes; público: ilimitado | ~1 min cada 2 h ≈ 360 min/mes |
| Hosting web | Cloudflare Workers (assets estáticos) | Servir archivos estáticos es gratis e ilimitado | ≈370 despliegues/mes |
| IA | Gemini free tier | Varias peticiones/min y cientos/día | 12/día |
| App móvil | PWA | — | Instalable en Android, iOS y PC |

**Frecuencia:** el workflow actualiza **cada 2 horas** (≈370 despliegues/mes): suficiente para un diario y dentro de los minutos gratuitos de GitHub Actions incluso con el repo privado. Se puede subir a cada hora cambiando el `cron`. Inicialmente se planteó Cloudflare Pages, pero Cloudflare recomienda ya Workers con assets estáticos para proyectos nuevos (y Pages limita a 500 despliegues/mes).

Alternativa sin Cloudflare: hacer el repositorio público y usar **GitHub Pages** (gratis, sin límite de despliegues relevante). En repos privados GitHub Pages requiere plan de pago.

Por qué no un servidor “de verdad”: leer los RSS directamente desde el navegador no funciona (bloqueo CORS), y los *workers* gratuitos tienen límites de CPU muy bajos (10 ms en Cloudflare Workers) para parsear 40 feeds. GitHub Actions no tiene ese problema.

**Único coste opcional:** un dominio propio (~10 €/año). Sin él, la web vive en `mi-diario.<tu-subdominio>.workers.dev`.

**App nativa:** descartada para empezar (Google Play 25 $ una vez, App Store 99 $/año). La PWA se instala desde el navegador, funciona sin conexión con la última edición descargada y no requiere tiendas.

## 5. Aspectos legales (importante si se hace pública)

- **Uso personal:** sin problema; es lo mismo que un lector RSS.
- **Uso público:** mostrar solo **titular + extracto corto que el propio medio pone en su RSS + enlace** al original; nunca el texto completo. La Directiva (UE) 2019/790 (art. 15, derecho de los editores de prensa) y su transposición en España (RDL 24/2021) permiten “palabras sueltas o extractos muy breves”, pero el terreno es gris: Google News cerró en España de 2014 a 2022 por esto.
- No saltarse muros de pago, respetar los términos de cada feed (algunos piden atribución o prohíben uso comercial: p. ej. NYT, The Guardian) e identificar el bot con un User-Agent propio.
- Si se monetiza (publicidad, suscripción) habría que revisar licencias con más cuidado o negociar con los medios.
- Resúmenes IA: marcarlos siempre como tales y enlazar a las fuentes (cumple además con las obligaciones de transparencia del Reglamento Europeo de IA).

## 6. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Un feed cambia o se cae | El script continúa con los demás y lista los que fallan. |
| Clasificación por palabras clave imperfecta | Reglas afinables en `scripts/ingest/classify.js`; fase futura con embeddings o con la propia IA. |
| Cuotas o modelos de IA cambian (Google retira versiones a menudo) | Se usan los alias `gemini-flash-latest` y, si falla, `gemini-flash-lite-latest`; la web funciona sin IA y reaprovecha los últimos resúmenes. Modelo configurable (`GEMINI_MODEL`). |
| El cron de GitHub se retrasa o se desactiva tras 60 días sin actividad en el repo | Ejecutable a mano (`workflow_dispatch`); un commit reactiva el cron. |
| Perfil solo en un dispositivo | Exportar/importar; en el futuro, login con Supabase o Cloudflare D1 (ambos con plan gratuito). |

## 7. Hoja de ruta

1. ✅ **MVP** (este repo): ingesta RSS, agrupación, clasificación, ranking personal, PWA, resúmenes IA.
2. Puesta en marcha: cuenta de Cloudflare + clave de Gemini (ver README).
3. Mejoras: búsqueda, notificaciones push de temas favoritos, *embeddings*, briefing de mañana/tarde, más fuentes regionales.
4. Si se abre al público: cuentas de usuario, revisión legal, dominio propio.
