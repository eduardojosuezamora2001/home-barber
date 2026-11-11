# HOME Barbería

Sitio y panel de gestión para una barbería con varias sucursales. Los clientes pueden consultar horarios, elegir sede, servicio y barbero, y enviar su solicitud por **WhatsApp Business (+506 6052 4368)**. Si tienen cuenta, la solicitud se registra y pueden seguir sus citas, visitas, puntos y cupones.

## Ejecutar en desarrollo

Requiere Node 20.19+ y pnpm 11.

```bash
pnpm install
pnpm dev
```

Abre `http://localhost:3000`. Turbo inicia Vite en el puerto 3000 y la API Hono en el 8787. Vite redirige `/api` a Hono. El navegador solo habla con la API; la conexión a Supabase, la autenticación y las consultas a la base de datos viven en [`apps/backend`](apps/backend/).

## Páginas

La portada está en `/`. El propietario entra directamente en `/admin` después de iniciar sesión con su cuenta autorizada. El panel tiene páginas con URL propia: `/admin/citas`, `/admin/promociones`, `/admin/sucursales`, `/admin/sucursales/nueva`, `/admin/equipo`, `/admin/equipo/:id`, `/admin/encargados`, `/admin/comprobantes`, `/admin/comprobantes/nuevo`, `/admin/comprobantes/:id` y `/admin/servicios`. En **Equipo** se puede buscar, filtrar por sucursal y estado, paginar los resultados y abrir el perfil de cada empleado para editar sus datos, sucursales y turnos. El botón **Agregar empleado** abre un formulario modal; las acciones administrativas muestran avisos mediante Sonner. Una sucursal nueva se crea oculta; configura sus horarios en **Sucursales** y actívala cuando esté lista. Las rutas `/cliente`, `/barbero` y `/encargado` corresponden a esos roles. Todas las páginas privadas comprueban la sesión y el rol en la API.

El backend trae configurados la URL y la clave **publicable** del proyecto Supabase `home-barbershop` (`azebvkknyursakzaldkl`). Puedes cambiarlas con variables de entorno del proceso backend:

```dotenv
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_PUBLISHABLE_KEY=tu-clave-publicable
SUPABASE_SECRET_KEY=tu-clave-secreta-solo-en-el-backend
WEB_ORIGIN=http://localhost:3000
PORT=8787
```

Las consultas privadas usan el token de cada usuario y las políticas RLS. El registro público de prospectos sin cuenta usa `SUPABASE_SECRET_KEY` exclusivamente en el backend; si falta, el formulario mantiene la salida a WhatsApp pero no guarda la consulta en el CRM. Nunca incluyas esta clave en el frontend ni en el repositorio. Las sesiones se guardan en cookies `HttpOnly` y `SameSite=Lax`; las operaciones de escritura comprueban el origen. Las migraciones están en [`supabase/migrations`](supabase/migrations/).

## CRM de clientes

El propietario abre `/admin` y cada encargado `/encargado`; las secciones del CRM están integradas en el sidebar del panel. Incluye contactos con y sin cuenta, consultas web, tareas, campañas manuales de WhatsApp, importación CSV para el propietario, oportunidades de regreso y resultados sobre comprobantes HOME-I cobrados. Los contactos sin cuenta no acumulan puntos ni reciben cupones. Los valores iniciales de regreso por servicio y frecuencia comercial están etiquetados como DEMO y son editables por el propietario.

Las migraciones [`20261109202925_crm_contacts_manual_campaigns.sql`](supabase/migrations/20261109202925_crm_contacts_manual_campaigns.sql) y [`20261109203936_crm_direct_contact_relationships.sql`](supabase/migrations/20261109203936_crm_direct_contact_relationships.sql) están aplicadas al proyecto Supabase conectado. La segunda habilita las consultas anidadas de contactos para Consultas, Seguimientos y campañas. Para registrar consultas públicas falta configurar `SUPABASE_SECRET_KEY` en el proceso del backend. No se debe exponer esa clave como variable de Vite. Los resultados de campañas son declaraciones del equipo; no equivalen a ventas atribuidas. El informe muestra un límite explícito si se alcanzan 1.000 registros en 90 días.

Los nombres de las migraciones locales están alineados con las versiones registradas en el proyecto Supabase conectado al 9 de noviembre de 2026.

Las migraciones `receipt_coupon_discounts` y `automatic_coupon_discounts` están aplicadas en el proyecto actual (versiones remotas `20261109053550` y `20261109060646`). En otro entorno, aplícalas antes de usar el cobro con cupones. Cada campaña define un descuento fijo en colones o porcentual; referidos permite configurar un descuento para cada persona. El cupón conserva el tipo y valor al emitirse, y la base calcula la rebaja automáticamente sobre el subtotal, redondeada a dos decimales y limitada al subtotal. La API rechaza montos de descuento enviados por el cliente. La emisión y el canje son una sola transacción y el comprobante conserva la definición y el monto aplicado. Las cortesías anteriores sin un importe definido siguen sin rebaja monetaria; configura los valores de la campaña en Editar para sus nuevos cupones.

Los grupos de rutas privados verifican la sesión activa y el rol vigente en la base de datos. El cierre de sesión revoca también la sesión de Supabase; los permisos privilegiados de RLS rechazan sesiones revocadas. Las respuestas privadas usan `private, no-store`. La revisión y sus resultados están en [auditoria-rendimiento-seguridad.md](docs/auditoria-rendimiento-seguridad.md).

## Producción

```bash
pnpm build
pnpm --filter @home/backend start
```

Configura `NODE_ENV=production`, `WEB_ORIGIN=https://tu-dominio` y las variables Supabase en el servidor. Hono sirve el build estático de Vite y `/api` desde el mismo origen. Añade el dominio a las URL de redirección permitidas de Supabase Auth y sirve el sitio con HTTPS para que funcionen las cookies seguras.

El build genera gzip y Brotli. Los archivos con hash se almacenan en caché por un año; imágenes y fuentes por un día; el HTML se revalida. El catálogo público usa caché de 15 segundos y ETag. Las rutas API inexistentes devuelven JSON 404. La autenticación limita intentos por instancia; si hay un proxy controlado configura `TRUST_PROXY_HOPS` y restringe el acceso directo al backend antes de confiar en los encabezados de IP.

### Correo de autenticación

Antes de abrir el registro a clientes, configura un proveedor SMTP y un remitente verificado en Supabase Auth. El correo integrado de Supabase solo entrega a miembros de la organización y tiene un límite de 2 mensajes por hora; por eso el registro y la recuperación de contraseña de clientes externos no funcionarán con la configuración inicial. Consulta la [guía oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Mantén activada la confirmación de correo, ya que la asignación inicial del rol propietario depende del correo confirmado.

### Acceso por correo

La pantalla de acceso permite crear una cuenta e iniciar sesión con correo y contraseña. El cliente confirma su correo antes de entrar y puede solicitar un enlace de recuperación de contraseña. Añade el valor exacto de `WEB_ORIGIN` a las **Redirect URLs** permitidas en Supabase Auth, tanto para desarrollo como para producción, para que los enlaces de confirmación y recuperación regresen a la aplicación.

## Cuentas y roles

- **Cliente:** crea una cuenta con correo y contraseña y confirma su dirección antes de entrar. Después consulta citas, visitas, puntos, recompensas y referidos. El enlace de confirmación abre la sesión en el backend; desde el acceso también puede reenviar la confirmación o recuperar su contraseña.
- **Barbero:** el propietario vincula una cuenta registrada con un perfil del equipo. Puede ver y gestionar las citas asignadas.
- **Encargado:** el propietario asigna una cuenta registrada a una sola sucursal desde `/admin/encargados`. En `/encargado` ve únicamente el equipo, las citas y los comprobantes de esa sucursal. Busca al cliente por su correo exacto, vincula al empleado y una cita si existe, registra servicios, cantidades y precios, y emite un comprobante interno imprimible. Puede ver el detalle en `/encargado/comprobantes/:id`. El propietario consulta los comprobantes de todas las sedes desde `/admin/comprobantes`.
- **Propietario:** registra y confirma `pachadcacique@gmail.com`. La base de datos le asigna el rol `owner`; desde el panel administra solicitudes, cupones, promociones, servicios, sucursales, profesionales y horarios. Puede consultar y emitir comprobantes internos de cualquier sucursal desde `/admin/comprobantes`.

Los rangos se sustituyeron por tres tipos de campañas en /admin/promociones:

- **Bienvenida:** un cupón después de la primera visita atendida, para una próxima visita.
- **Frecuencia:** un cupón cada N visitas atendidas (N entre 2 y 100). El historial total cuenta para el progreso y las recompensas se generan al completar cada nuevo múltiplo; no se emiten premios retroactivos al publicar una campaña.
- **Referidos:** una única invitación por cliente, registrada antes de su primera visita. Al completar esa visita en la sucursal de la campaña, la persona invitada y quien invita reciben cupones independientes. Cada nuevo referido atendido puede generar otro cupón para quien invita. Se admite una campaña de referidos activa a la vez.

Las visitas y los puntos se acreditan al marcar una cita confirmada como **atendida** o al emitir un comprobante interno de una visita nueva. Un comprobante vinculado a una cita no duplica visitas ni recompensas. Cada campaña define beneficio, condiciones, sucursal, fechas y días de validez del cupón. El cupón vence al cumplirse su plazo o finalizar la campaña, lo que ocurra primero; pausar la campaña suspende también sus canjes. La migración conserva visitas, puntos y cupones anteriores. Las promociones anteriores conservan sus condiciones de visitas, puntos e inactividad, sin rangos.

El cliente comparte su código o un enlace con ?ref=INV-XXXXXXXXXXXX desde /cliente. El código se conserva durante el registro por correo y se confirma en la cuenta antes de la primera visita. La base de datos impide autorreferidos, cambios de invitación, creación de recompensas por el cliente y canjes duplicados. El propietario valida y canjea el código del cupón en /admin/promociones; el beneficio se aplica durante la atención, no descuenta automáticamente el total del comprobante.

La prueba transaccional supabase/tests/loyalty_rewards.sql verifica recompensas, referidos, comprobantes, vencimiento y permisos; revierte todos sus datos al finalizar.

El comprobante HOME-I es un **registro interno** de los servicios y el cobro. Se guarda con un número consecutivo y una copia de nombres, servicios, precios y total al momento de emitirlo. No sustituye una factura electrónica fiscal de Costa Rica.

## Rendimiento y datos de prueba

Las fotos están en WebP y las que quedan fuera de pantalla se cargan cuando hacen falta. El formulario de reserva y los paneles de cada rol se importan de forma diferida; `IntersectionObserver` activa la reserva al acercarse al área visible. Se muestran skeletons mientras llegan el catálogo, el formulario y los datos de los paneles. El catálogo público se almacena brevemente en la API y se invalida al editar datos operativos.

[`supabase/seed.sql`](supabase/seed.sql) contiene datos de prueba reproducibles: tres sedes, diez profesionales, ocho servicios con precios en colones y tres campañas inicialmente inactivas. El script se puede volver a ejecutar sin duplicar las filas que crea. La sede Esparza conserva el estado inactivo y la dirección introducida desde el panel; las otras sedes usan ubicaciones generales, no direcciones verificadas. Los nombres, biografías, precios y promociones son ficticios aunque estén redactados como datos de operación. Revisa estos datos antes de publicar el sitio o activar una promoción.

El seed no crea cuentas de Supabase Auth ni inventa citas o comprobantes a nombre de personas reales. Para probar los flujos de encargado y cliente con inicio de sesión, registra y confirma esas cuentas y asigna el encargado desde `/admin/encargados`. Las imágenes son ilustrativas y no representan el local ni el equipo real.

## Verificación

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @home/backend test
```

Las 15 tablas de negocio tienen Row Level Security activa. La disponibilidad combina horarios de sede y barbero con bloques de citas confirmadas; la confirmación impide reservar el mismo profesional para dos citas simultáneas. Los permisos del encargado se aplican también en la base de datos por sucursal.
