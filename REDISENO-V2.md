# Modelador de Sistemas 2.0 — registro del rediseño

Rama `rediseno-v2`, creada desde `main` (1fd1d30). Nada de esto llega a `main`
sin aprobación explícita.

> Nota: la etiqueta `v1.0.0` apunta a 6185434, anterior al modo oscuro, al
> arreglo de notas de secuencia, a la propagación de renombres y a la limpieza
> de etiquetas de asociaciones. `main` ya los incluye, y la beta parte de ahí.

## 1. Preparación: la beta convive con la v1

| | v1 (actual) | 2.0 Beta |
|---|---|---|
| Nombre | Modelador de Sistemas | Modelador de Sistemas 2.0 Beta |
| Bundle id | `com.alejocarabelli.disenosistemas` | `com.alejocarabelli.disenosistemas.beta2` |
| Ejecutable | `DisenoDeSistemas` | `ModeladorBeta` |
| Instalación | `/Applications/Modelador de Sistemas.app` | `/Applications/Modelador de Sistemas 2.0 Beta.app` |
| Esquema web (origen del almacenamiento) | `disenosistemas://app` | `modeladorbeta://app` |
| Respaldos | `~/Documents/Modelador de Sistemas/Respaldos` | `~/Documents/Modelador de Sistemas 2.0 Beta/Respaldos` |
| Carpeta de compilación | `/private/tmp/diseno-sistemas-macos-build` | `/private/tmp/modelador-sistemas-v2-beta-build` |

**Por qué la beta no ve tus proyectos:** WebKit guarda el almacenamiento local
por aplicación (bundle id) y, dentro de ella, por origen (esquema). La beta
cambia las dos cosas. Las claves y el formato del almacenamiento son los mismos
que en la v1, así que un JSON exportado de una se importa en la otra.

**El script nunca toca la v1:** solo borra y reemplaza
`/Applications/Modelador de Sistemas 2.0 Beta.app`. Con `SKIP_INSTALL=1`
compila sin instalar.

**Etiqueta Beta:** el nombre de la ventana y el menú dicen "2.0 Beta", y la
barra lateral muestra una etiqueta "Beta" junto al nombre.

**Compilación en GitHub:** `.github/workflows/beta-macos.yml` compila en un Mac
de GitHub Actions en cada push a `rediseno-v2` (el `.dmg` y el `.zip` quedan como
artefacto de la ejecución). Al subir una etiqueta `v2.*-beta.*` además los
publica como pre-release.
