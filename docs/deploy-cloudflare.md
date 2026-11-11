# Despliegue en Cloudflare

El backend se publica como el Worker `home-barbershop-api` y la web como el proyecto Pages `home-barbershop-web`. Pages envía únicamente `/api` y `/api/*` al Worker mediante el service binding `API`. El resto del sitio se sirve como archivos estáticos.

El navegador mantiene sus llamadas a `/api` en el mismo dominio. Los encabezados `Set-Cookie` del backend llegan sin modificaciones al navegador, incluyendo las cookies HttpOnly, Secure y SameSite. El backend conserva sus comprobaciones de origen y permisos. No necesitas configurar una URL de API en Vite ni habilitar CORS entre dominios.

## Preparación inicial

1. Usa Node **22.12 o superior** (recomendado Node 24) e instala las dependencias con `pnpm install`. Este repositorio usa workspaces de pnpm; los comandos de despliegue compilan cada aplicación con las dependencias del monorepo.
2. Autentica la CLI una sola vez con `pnpm exec wrangler login`. Para CI, proporciona `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` como secretos del entorno de ejecución. El token debe poder administrar Workers y Pages en la misma cuenta.
3. Revisa los nombres en `apps/backend/wrangler.jsonc` y `apps/web/wrangler.jsonc`. Si cambias el nombre del backend, actualiza también `services[0].service` en Pages. El proyecto Pages se creó con la rama de producción **deploy-cloudflare**; el script de despliegue utiliza esa misma rama.
4. Configura `WEB_ORIGIN` en `apps/backend/wrangler.jsonc` con el origen exacto de la web, sin `/` final. Inicialmente es `https://home-barbershop-web.pages.dev`. Si Pages asigna un subdominio con sufijo porque el nombre ya existe, o añades un dominio propio, usa ese origen y vuelve a desplegar el backend.
5. Copia `apps/backend/.dev.vars.example` a `apps/backend/.dev.vars` y completa **SUPABASE_SECRET_KEY** con la clave de servidor de Supabase. El archivo está ignorado por Git. No guardes esa clave en `vars`, en Pages ni en variables `VITE_*`.
6. En Supabase Auth, establece **Site URL** y añade a **Redirect URLs** el mismo origen de `WEB_ORIGIN`. Esto permite que la confirmación de correo y recuperación de contraseña vuelvan al sitio publicado. El envío de correo requiere el SMTP del proyecto ya configurado.

La URL de Supabase y la clave publicable de este proyecto ya están en las variables del Worker. Si cambias de proyecto Supabase, actualiza ambas y la región `placement.region`; el proyecto actual está en AWS `us-east-1`.

## Los dos comandos

Desde la raíz, ejecuta en este orden:

```bash
pnpm run deploy:backend
pnpm run deploy:frontend
```

El primero comprueba los tipos del backend y publica el Worker. Si existe `.dev.vars`, sube sus valores como secretos cifrados en el mismo despliegue mediante `--secrets-file`. Si el secreto ya está configurado en Cloudflare, el archivo local es opcional: los secretos remotos se conservan. La configuración exige `SUPABASE_SECRET_KEY` y Wrangler detiene el despliegue si falta.

El segundo genera los tipos de Pages, comprueba TypeScript, compila Vite y publica `apps/web/dist` en la rama de producción `deploy-cloudflare`. Se reutiliza el proyecto Pages `home-barbershop-web`. El backend debe desplegarse primero y ambos proyectos deben pertenecer a la misma cuenta: Pages necesita encontrar el Worker `home-barbershop-api` para enlazar el binding `API`.

El Worker tiene `workers_dev: false` y `preview_urls: false`: se accede mediante el binding de Pages, no mediante una URL pública independiente. La API se puede comprobar en `https://home-barbershop-web.pages.dev/api/health` (sustituye el dominio si lo cambiaste).

## Archivos

| Archivo | Función |
| --- | --- |
| `apps/backend/wrangler.jsonc` | Worker, variables, secreto requerido, región, logs y trazas |
| `apps/backend/src/worker.ts` | Entrada Fetch de Hono, sin iniciar servidor Node |
| `scripts/deploy-backend.mjs` | Carga opcional del archivo de secretos al desplegar |
| `apps/web/wrangler.jsonc` | Pages y enlace al Worker |
| `apps/web/functions/api/[[path]].ts` | Proxy de todos los métodos de `/api` hacia el Worker |
| `apps/web/public/_routes.json` | Ejecuta Functions solo para rutas de API |
| `apps/web/public/_headers` | Seguridad y caché de archivos estáticos |
| `apps/web/cloudflare-env.d.ts` | Tipos de bindings generados por Wrangler |

Pages resuelve las rutas de la SPA como `/cliente` y `/admin` usando su fallback a `index.html`; no agregues un `404.html` al directorio público si quieres conservar ese comportamiento. Las rutas desconocidas de la API siguen respondiendo desde Hono, sin convertirse en HTML de la SPA.

## Validación sin publicar

```bash
pnpm run check:cloudflare
```

Comprueba los tipos, empaqueta el backend con `wrangler deploy --dry-run`, construye la web y compila Pages Functions. No crea proyectos ni publica versiones. Para regenerar los tipos después de cambiar bindings:

```bash
pnpm run cf:types
```

El desarrollo habitual continúa con `pnpm dev`: Vite y el servidor Node local conservan su funcionamiento. Los límites de peticiones y la caché pública en Workers son por instancia; no son contadores globales distribuidos.

Después de publicar puedes comprobar rutas, assets, API y cookies sin crear cuentas ni enviar correos:

```bash
node scripts/smoke-cloudflare.mjs https://home-barbershop-web.pages.dev --catalog
```

La opción `--catalog` hace tres lecturas concurrentes del catálogo público real de Supabase. Sin esa opción, las comprobaciones no consultan la base de datos. Puedes usar el mismo script con una instancia local de Pages que tenga enlazado el Worker.

Esta configuración cubre producción. Un entorno de pruebas independiente requiere otro Worker, otro binding, origen propio y un proyecto Supabase de pruebas antes de publicar ramas de preview con escrituras.

## Referencias

- [Configuración de Pages con Wrangler](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Service bindings en Pages](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Secretos junto al despliegue del Worker](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code)
- [Variables de entorno de Node en Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/#processenv)
