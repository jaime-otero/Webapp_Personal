# Estudio de viabilidad: web/app de noticias personalizada y gratuita

*Octubre de 2026 (actualizado el 6/10/2026 con lo que ya está hecho)*

## Conclusión

**Es viable y puede costar 0 €**, tanto para uso personal como, con algunas precauciones legales, para abrirla al público más adelante. La clave es no depender de APIs de noticias de pago: casi todos los medios serios publican **feeds RSS** oficiales y gratuitos, pensados precisamente para que lectores y agregadores los consuman.

Este repositorio contiene la aplicación ya en marcha (ver `README.md`).

## 1. ¿De dónde salen las noticias?

| Opción | Coste | Veredicto |
|---|---|---|
| **RSS oficiales de los medios** | Gratis | ✅ Elegida. Titular, extracto, imagen, fecha y enlace. Estable y legal. |
| The Guardian Open Platform, NYT API | Gratis con clave (cuotas, uso no comercial) | ➕ Complemento opcional; sus RSS ya bastan. |
| GDELT | Gratis | Útil para análisis masivo, demasiado ruidoso para un diario personal. |
| NewsAPI.org, GNews, Currents… | Free tier muy limitado | ❌ NewsAPI solo permite el plan gratis en `localhost` y con retraso. |
| *Scraping* de webs | Gratis | ❌ Frágil y legalmente arriesgado. |

**Fuentes (117 feeds de 52 medios, en `sources.json`):**

- **España:** El País (portada y secciones), El Mundo, RTVE, elDiario.es, La Vanguardia, Europa Press, 20minutos, ABC, El Confidencial, Expansión, Cinco Días.
- **EE. UU.:** The New York Times, The Guardian, BBC News, Politico, The Hill.
- **Internacional:** BBC News (y sus feeds por región), BBC Mundo, The Guardian, The New York Times, Al Jazeera, DW, France 24, El País (Internacional y América).
- **Ciencia:** Agencia SINC, Naukas, Muy Interesante, Quanta Magazine, Physics World, Phys.org (física), CERN, Nature, Science, New Scientist, ScienceDaily, BBC, The Guardian, Ars Technica, Wired, ESA, NASA, El País.
- **Tecnología y economía:** Xataka, Hipertextual, MIT Technology Review, IEEE Spectrum, TechCrunch, The Verge, BBC, The Guardian, El País, The New York Times.
- **Deportes:** Marca, AS, Mundo Deportivo, BBC Sport, The Guardian, ESPN, CBS Sports, Yahoo Sports, Hoops Rumors (NBA), Cyclingnews, Triathlete, Runner's World.

Limitaciones: **Reuters y AP no tienen RSS público** (se cuelan vía otros medios); **EFE** no ofrece RSS operativo; arXiv se descartó por ser demasiado técnico para un feed general. Los feeds cambian de URL de vez en cuando: en cada edición el script lista los que fallan para sustituirlos.

## 2. ¿Cómo se adapta a mis gustos?

Por capas, de menos a más sofisticado:

1. **Preferencias explícitas** (hecho): 7 secciones y sus subsecciones con 5 niveles (de "Ocultar" a "Me encanta") y el orden de las pestañas, idiomas, medios favoritos/silenciados, palabras clave a potenciar o silenciar y resultados de la NBA tapados.
2. **Aprendizaje implícito** (hecho): ❤️, guardar y abrir una noticia suman; 👎 y ocultar restan. Un modelo de regresión logística online ajusta el peso de sus rasgos (sección, medio, palabras y pares de palabras del titular, nombres propios). Lo aprendido se va olvidando poco a poco (3 % al día) para seguir tus intereses actuales.
3. **Señales editoriales** (hecho): si muchos medios cubren la misma noticia, sube; las noticias se agrupan para no ver la misma historia 6 veces; diversidad para que no copen la portada diez noticias del mismo tema, y 1 de cada 10 "para descubrir".
4. **Correcciones** (hecho): con 🏷️ se mueve una noticia de sección, y la corrección se aplica también a las parecidas.
5. **Recomendación semántica** (futuro): *embeddings* multilingües (p. ej. Cloudflare Workers AI o transformers.js en el navegador) para entender que “fusión nuclear” y “ITER” van juntos, incluso entre español e inglés.

El perfil vive en el navegador (`localStorage`) y, si se activa, se sincroniza entre dispositivos a través del Worker (Cloudflare KV): con un enlace con código aleatorio o, con el inicio de sesión por invitación, con la cuenta de cada persona. También se puede exportar/importar como archivo.

## 3. Resúmenes con IA

- **Gemini API (Google AI Studio), plan gratuito**: cada 2 h, 9 llamadas (portada, las 7 secciones y la NBA, esta sin resultados), de 3 en 3 en paralelo. Cada una redacta el *briefing* de su sección y resume sus noticias más relevantes (12 en portada, 8 en cada sección): ≈80 llamadas/día, muy por debajo de las cuotas gratuitas.
- De reserva, **Groq** (gratis, con clave) y **GitHub Models** (gratis con el `GITHUB_TOKEN` del workflow): si un proveedor falla, tarda demasiado o responde mal, se pasa al siguiente. Otras alternativas: Cloudflare Workers AI (cuota diaria gratuita); de pago y baratas: Claude Haiku, GPT‑mini.
- Ojo: en el plan gratuito de Gemini, Google puede usar las peticiones para mejorar sus modelos. Aquí solo se envían titulares públicos, así que no es un problema.
- La IA solo resume **titulares y extractos** que ya publica el RSS (no el artículo completo), siempre muestra la etiqueta “IA” y enlaza a las fuentes.

## 4. Infraestructura gratuita

| Pieza | Servicio | Límite gratuito | Uso previsto |
|---|---|---|---|
| Actualización periódica | Cron del Worker de Cloudflare → GitHub Actions | Repo público: minutos ilimitados (en uno privado, 2.000 min/mes: habría que bajar la frecuencia) | ≈38 ediciones/día |
| Hosting web y API | Cloudflare Workers (assets estáticos + Worker) | 100.000 peticiones/día (con el inicio de sesión todas pasan por el Worker) | ≈1.150 despliegues/mes |
| Sincronización | Cloudflare KV | 100.000 lecturas y 1.000 escrituras/día | Una escritura por cambio, como mucho cada 15 s por dispositivo |
| IA | Gemini free tier (+ Groq y GitHub Models) | Varias peticiones/min y cientos/día | ≈80/día |
| App móvil | PWA | — | Instalable en Android, iOS y PC |

**Frecuencia:** el cron del Worker de Cloudflare lanza la actualización **cada 30 min de 7:17 a 0:47** (hora de España en verano) y dos veces de madrugada (≈38 ediciones/día); el cron de GitHub queda de reserva porque se retrasa horas. Los resúmenes IA solo se regeneran cada 2 h; en las ediciones intermedias entran noticias nuevas y se conservan los resúmenes anteriores.

Alternativa sin Cloudflare: **GitHub Pages** (gratis en repos públicos), pero solo para la web estática: sin el Worker no hay sincronización, inicio de sesión ni actualización puntual.

Por qué no un servidor “de verdad”: leer los RSS directamente desde el navegador no funciona (bloqueo CORS), y los *workers* gratuitos tienen límites de CPU muy bajos (10 ms en Cloudflare Workers) para parsear más de 100 feeds. GitHub Actions no tiene ese problema; el Worker solo hace lo ligero: servir la web, el inicio de sesión, la sincronización y lanzar la actualización.

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
| Clasificación por palabras clave imperfecta | Palabras clave en `web/lib/taxonomy.js` y reglas en `scripts/ingest/classify.js`; el botón 🏷️ corrige una noticia (y las parecidas) y la lista de correcciones se puede copiar para afinar el clasificador; fase futura con embeddings o con la propia IA. |
| Cuotas o modelos de IA cambian (Google retira versiones a menudo) | Se usan los alias `gemini-flash-latest` y, si falla, `gemini-flash-lite-latest`; después Groq y GitHub Models. La web funciona sin IA y reaprovecha los últimos resúmenes. Modelos configurables (`GEMINI_MODEL`, `GROQ_MODEL`, `GITHUB_MODELS_MODEL`). |
| El cron de GitHub se retrasa o se desactiva tras 60 días sin actividad en el repo | El cron del Worker lanza el workflow a su hora; el de GitHub queda de reserva. Si GitHub lo desactiva, se reactiva desde *Actions*. |
| Perfil solo en un dispositivo | Resuelto: sincronización por Cloudflare KV (enlace o cuenta por invitación) y exportar/importar. |
| Cuota gratuita de KV (1.000 escrituras/día) | El perfil solo se sube cuando cambia, como mucho cada 15 s por dispositivo. |

## 7. Hoja de ruta

1. ✅ **MVP**: ingesta RSS, agrupación, clasificación, ranking personal, PWA, resúmenes IA.
2. ✅ **Puesta en marcha**: Cloudflare Workers, Gemini con Groq y GitHub Models de reserva, cron del Worker (ver README).
3. ✅ **Hecho después**: subsecciones y orden de pestañas, sincronización entre dispositivos, inicio de sesión por invitación, sin spoilers de la NBA, corrección de secciones, ordenar por recientes o por nº de medios, aviso de edición nueva.
4. Pendiente: búsqueda, notificaciones push de temas favoritos, *embeddings*, briefing de mañana/tarde, más fuentes regionales.
5. Si se abre al público: revisión legal, dominio propio.
