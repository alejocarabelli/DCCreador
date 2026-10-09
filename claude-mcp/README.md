# Modelador de Sistemas para Claude (prueba)

Extensión para Claude Desktop en Mac. Le permite a Claude ver, en modo solo lectura, lo que estás haciendo en el Modelador de Sistemas, para que puedas estudiar con él: "¿está bien esta secuencia según el flujo?", "¿me falta alguna relación en el diagrama de clases?".

No cambia nada en la app. Lee el último respaldo automático que la app ya guarda en **Documentos › Modelador de Sistemas › Respaldos** y se lo pasa a Claude resumido en texto. No modifica nada y no usa internet.

## Instalar

1. Bajá `modelador-de-sistemas.mcpb`.
2. En Claude Desktop andá a **Configuración › Extensiones › Configuración avanzada** y en **Extension Developer** tocá **Instalar extensión…**. Elegí el archivo. (También suele andar haciendo doble clic en el archivo.)
3. Claude avisa que la extensión no está verificada: es esperable, aceptá.

## Usar

Con la app abierta en lo que estás haciendo, preguntale a Claude, por ejemplo:

- "Mirá lo que estoy haciendo en el Modelador y decime si está bien."
- "Compará mi secuencia con el flujo de sucesos del CU 3."
- "Respondé las dudas que anoté en el proyecto."

Claude tiene estas herramientas:

| Herramienta | Qué hace |
|---|---|
| `ver_lo_que_estoy_haciendo` | El artefacto abierto ahora, resumido, con tus apuntes y dudas. |
| `listar_proyectos` | Tus proyectos y sus artefactos. |
| `leer_artefacto` | Otro artefacto del proyecto, resumido. |
| `leer_mis_dudas` | Las dudas y apuntes de todo el proyecto. |
| `leer_artefacto_json` | El JSON completo; solo si el resumen no alcanza. |

### Ojo con la demora

La app escribe un respaldo cada 10 minutos y cada vez que la minimizás. Si acabás de cambiar algo, **minimizá la app (⌘M)** antes de preguntar. Cada respuesta le dice a Claude de qué hora es el respaldo que está viendo.

## Para desarrollar

```sh
npm test       # pruebas (Node 18 o más nuevo, sin dependencias)
npm run pack   # arma modelador-de-sistemas.mcpb
```

Para probar contra otra carpeta de respaldos: `MODELADOR_RESPALDOS=/ruta node server/index.js`.
