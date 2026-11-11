# Revisión de rendimiento y seguridad

Revisión realizada el 8 de noviembre de 2026 sobre el build de producción local y el proyecto Supabase `home-barbershop`.

## Resultados medidos

Los tamaños corresponden a bytes transferidos, expresados en KB decimales. Son mediciones HTTP locales, no una puntuación de Lighthouse ni mediciones de experiencia de usuarios reales.

| Recurso o comportamiento | Antes | Después |
| --- | --- | --- |
| JavaScript principal | 308 KB sin compresión | 96 KB gzip / 91 KB Brotli |
| Catálogo público | 22,1 KB sin compresión | 3,6 KB gzip; 18,1 KB antes de comprimir |
| Archivos con hash en `/assets/` | Sin política explícita | Caché pública de un año, `immutable` |
| Imágenes y fuente local | Sin política explícita | Caché de un día con revalidación |
| Documento HTML | Sin política explícita | `no-cache`, ETag y compresión |
| Catálogo público sin cambios | Respuesta completa | ETag y respuesta `304` sin cuerpo |
| Rutas API inexistentes en producción | Podían devolver HTML con estado 200 | JSON con estado 404 |

En la última ejecución local, el catálogo respondió en 1.444 ms en frío, 16 ms con caché de servidor y 4 ms al revalidar con ETag. La petición fría depende de Supabase y de la red; estos tiempos no son una garantía de producción.

## Caché y carga

- Solo el catálogo anónimo usa caché compartida: 15 segundos en servidor y navegador, con `must-revalidate`. Las peticiones concurrentes comparten la misma carga.
- La invalidación tras cambios de catálogo, citas o comprobantes impide que una consulta anterior vuelva a poblar la caché. Las actualizaciones explícitas del frontend fuerzan la recarga HTTP.
- Sesiones, perfiles, paneles, promociones personales y comprobantes usan `private, no-store`. Las peticiones del catálogo omiten cookies; las privadas nunca usan caché persistente en el navegador.
- El catálogo público omite cuentas vinculadas de los barberos y filtra relaciones de sucursales o profesionales inactivos. Sus bloques de disponibilidad se limitan al horizonte de reservas de 14 días.
- El build genera archivos `.gz` y `.br`, que el servidor entrega directamente para evitar comprimirlos en cada solicitud. La API pública usa gzip cuando corresponde.
- Cabinet Grotesk se sirve localmente como una fuente variable WOFF2 de 41,9 KB, con preload y `font-display: swap`. Se eliminaron la hoja CSS y la conexión externas de Fontshare.
- Las imágenes WebP, las dimensiones explícitas y la carga diferida de paneles y reservas ya estaban presentes y se conservaron.

## Seguridad aplicada

- Los grupos `/api/owner/*`, `/api/manager/*`, `/api/staff/*` y `/api/client/*` comprueban sesión y rol antes de ejecutar sus handlers. Las comprobaciones adicionales de los handlers reutilizan el resultado solo dentro de la misma petición.
- Los JWT se verifican con Supabase. La autorización consulta la sesión activa, correo confirmado, estado de bloqueo y rol vigente en la base de datos. No toma permisos de metadatos editables del usuario.
- Una sesión revocada, vencida o perteneciente a otro usuario no permite entrar a las rutas protegidas. Los cambios de rol surten efecto en la siguiente petición.
- Cerrar sesión revoca la sesión de Supabase y sus tokens de refresco, además de borrar las cookies. Las cookies siguen siendo `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- Los helpers de propietario, encargado y barbero utilizados por RLS y RPC requieren una sesión activa. Así se bloquean también los permisos privilegiados si alguien llama directamente a PostgREST con un JWT de una sesión revocada.
- Las escrituras verifican el origen; las peticiones privadas marcadas como `cross-site` se rechazan. La API limita el cuerpo a 32 KB y valida los datos con Zod.
- Los endpoints de autenticación limitan los intentos y devuelven `429` con `Retry-After`. Por defecto no se confía en encabezados de IP proporcionados por el cliente.
- En producción se agregan CSP, protección contra inclusión en frames, `nosniff`, política de referencias, permisos de navegador y HSTS. La CSP permite scripts y conexiones del mismo origen; los estilos inline siguen permitidos porque los componentes usan estilos de posicionamiento.
- Las tablas de negocio tienen RLS activa. Las nuevas funciones públicas de sesión usan `SECURITY INVOKER`; las lecturas privilegiadas están en el esquema privado y verifican al usuario actual.

## Verificaciones

- 22 pruebas del backend pasaron, incluida la integración real con una cuenta DEMO.
- Todas las rutas de propietario rechazaron solicitudes anónimas y solicitudes con sesión de cliente antes de leer o modificar datos administrativos. También se verificó el rechazo de cliente en rutas de encargado y barbero.
- La prueba real comprobó aislamiento de cupones, cierre de sesión, rechazo del JWT anterior en la API y rechazo del token de refresco revocado.
- Las pruebas SQL verificaron roles vigentes, falsificación de metadatos, sesiones ajenas, bloqueo de cuentas, vencimiento, revocación y rechazo de escrituras administrativas directas por RLS.
- La suite SQL de fidelización pasó después de reforzar los permisos. Sus datos de prueba se revierten al terminar.
- La auditoría HTTP comprobó gzip, Brotli, caché, fuente local, ETag/304, ausencia de cookies en el catálogo, encabezados y estados 401/404.
- `pnpm audit --prod` no reportó vulnerabilidades en las dependencias de producción. La CLI de shadcn se reclasificó como herramienta de desarrollo: se usa para generar componentes y CSS durante el build, no para atender peticiones.

Para repetir las verificaciones:

```powershell
pnpm --filter @home/backend test
pnpm --filter @home/backend lint
pnpm --filter web lint
pnpm build

# Prueba real con la cuenta DEMO, sin concederle permisos administrativos:
$env:LIVE_TEST_EMAIL = 'cliente.nuevo@example.com'
$env:LIVE_TEST_PASSWORD = 'Cliente123!'
pnpm --filter @home/backend exec tsx --test tests/live-security.test.ts

# Con el servidor de producción local en ejecución:
node scripts/audit-http.mjs http://127.0.0.1:8789
```

Las migraciones `session_authorization` y `privileged_session_policies` están aplicadas en el proyecto actual. En otro entorno hay que aplicarlas antes de desplegar este backend.

## Límites y configuración pendiente

- No hubo navegador ni herramientas de trazas disponibles: faltan mediciones de LCP, INP y CLS y la validación visual de la CSP en un navegador real.
- Supabase mantiene desactivada la protección contra contraseñas filtradas. Es el aviso restante del asesor de seguridad; se configura en Supabase Auth.
- La cadena de herramientas de desarrollo de shadcn conserva dos avisos transitivos: uno bajo en `deepmerge`, sin parche publicado en el informe, y uno moderado en `minimatch`. No están en el árbol de dependencias de producción; no se forzaron cambios mayores incompatibles para ocultar esos avisos.
- El límite de intentos vive en memoria por instancia. Un despliegue con varias instancias necesita un límite compartido o en el proxy.
- `TRUST_PROXY_HOPS` vale `0` por defecto. Solo se debe configurar, por ejemplo a `1`, cuando el backend esté accesible exclusivamente mediante ese número de proxies controlados; de otro modo se permitiría falsificar la IP usada por el límite de intentos.
- Producción requiere HTTPS y un `WEB_ORIGIN` exacto. La política de caché estática y la compresión de archivos se aplican al servidor de producción, no al servidor de desarrollo de Vite.

Fuente de Cabinet Grotesk: [Fontshare](https://www.fontshare.com/fonts/cabinet-grotesk), la misma familia que ya usaba el sitio.
