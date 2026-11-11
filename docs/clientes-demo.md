# Clientes de ejemplo

Cuentas creadas en el proyecto Supabase `home-barbershop` para probar promociones y cupones.
Todos los correos están confirmados y todas las cuentas tienen rol de cliente.

**Contraseña compartida: `Cliente123!`**

| Correo | Estado inicial | Prueba sugerida |
| --- | --- | --- |
| `cliente.nuevo@example.com` | Sin visitas ni cupones | Completar su primera visita y recibir bienvenida. |
| `cliente.frecuente@example.com` | 4 visitas y un cupón de bienvenida | Completar otra visita y recibir la recompensa por 5 visitas. |
| `cliente.cupones@example.com` | 5 visitas; un cupón disponible, uno canjeado y uno vencido | Canjear el disponible y comprobar que los otros se rechazan. |
| `cliente.referidor@example.com` | 1 visita; bienvenida y recompensa por un referido atendido | Compartir su código e invitar a otro cliente nuevo. |
| `cliente.invitado@example.com` | Sin visitas y sin invitación registrada | Registrar el código de quien invita y completar la primera visita. |
| `cliente.referido@example.com` | 1 visita e invitación ya recompensada | Verificar su cupón y el de quien lo invitó. |

Los estados corresponden a la carga inicial; cambian al usar las cuentas.

## Comprobantes de ejemplo

La carga opcional [`supabase/seed-demo-receipts.sql`](../supabase/seed-demo-receipts.sql) agrega 18 comprobantes identificados como `[DEMO]`, con fechas, sucursales, profesionales, servicios y totales variados. Se consultan en `/admin/comprobantes` y permiten probar las páginas, los filtros, la cuadrícula, la lista y la impresión del detalle.

Once comprobantes están vinculados a citas DEMO ya atendidas y no duplican visitas ni puntos. Los otros siete representan atenciones sin cita: cinco para `cliente.cupones@example.com` y dos para `cliente.referidor@example.com`. Después de esta carga, esas cuentas tienen 10 y 3 visitas, respectivamente; la cuenta de cupones también recibe la recompensa correspondiente a su décima visita. Las cuentas de cliente nuevo e invitado siguen sin visitas y el cliente frecuente conserva sus 4 visitas.

La carga se puede repetir sin duplicar los comprobantes ni acreditar otra vez sus visitas. Requiere haber ejecutado primero `seed-demo-clients.sql`.

La extensión [`supabase/seed-demo-discount-receipts.sql`](../supabase/seed-demo-discount-receipts.sql) agrega otros **18 comprobantes**, cuatro con **₡1.000 de descuento**, para un total de 36 ejemplos al usar ambas cargas. Cada descuento tiene un cupón DEMO canjeado y conserva subtotal, beneficio y total en el detalle. Los nuevos registros se reparten entre las cuentas de cupones, referidor y referido: con ambas cargas iniciales acumulan 16, 9 y 7 visitas, respectivamente. Las cuentas nuevo/invitado permanecen sin visitas y frecuente conserva sus cuatro visitas. La extensión también se puede repetir sin duplicar registros; requiere la campaña DEMO de bienvenida activa y vigente.

Como cliente, abre `/cliente?tab=comprobantes` para revisar tus comprobantes con los mismos filtros, vistas de lista y cuadrícula y paginación del administrador. La cuenta `cliente.cupones@example.com` tiene varios registros para probar el listado, el detalle y la impresión o guardado en PDF; `cliente.nuevo@example.com` permite comprobar el historial vacío. Cada cuenta solo puede abrir sus propios documentos. Los registros siguen siendo documentos internos de HOME, no facturas electrónicas tributarias.

## Campañas activas

- `[DEMO] Beneficio de bienvenida`: ₡1.000 de descuento en la próxima visita después de completar la primera.
- `[DEMO] Premio cada cinco visitas`: 10% de descuento, cada 5 visitas.
- `[DEMO] Referidos para ambos`: el invitado recibe ₡1.000 de descuento y quien invita recibe 10% de descuento.

[`supabase/seed-demo-discount-values.sql`](../supabase/seed-demo-discount-values.sql) configura estos valores en las campañas DEMO anteriores que aún no tenían importe; respeta campañas ya personalizadas. Los cupones de cortesía emitidos antes de esta configuración mantienen su beneficio original sin rebaja monetaria.

Las campañas se crearon con 90 días de vigencia desde la carga. Cada cupón nuevo tiene hasta 30 días de validez, sin superar el final de la campaña. Se pueden pausar en `/admin/promociones`.

## Probar un referido completo

1. Inicia sesión como `cliente.invitado@example.com`.
2. En `/cliente`, registra el código `INV-DE0000000004` antes de completar su primera visita.
3. Registra una cita, confírmala y márcala atendida desde la cuenta del propietario. También puedes emitir un comprobante de una visita nueva para ese cliente.
4. Actualiza los beneficios del invitado: debe recibir bienvenida y el cupón de referido.
5. Entra como `cliente.referidor@example.com`: debe tener un nuevo cupón por esta invitación, además del ya generado por `cliente.referido@example.com`.

## Probar cupones

Entra como `cliente.cupones@example.com` y copia el código disponible. Con la cuenta del propietario, ve a `/admin/promociones` e introdúcelo en **Canjear cupón**. Después del canje, actualiza los beneficios del cliente. Los cupones vencidos y los ya canjeados deben rechazarse.

También puedes aplicarlo al cobrar en `/admin/comprobantes/nuevo`: primero valida el correo, después elige sucursal, profesional y servicios. Selecciona un cupón disponible o escribe su código y pulsa **Aplicar código**. El total se recalcula automáticamente: con subtotal de ₡5.000, un cupón de 10% rebaja ₡500; uno fijo de ₡1.000 rebaja ₡1.000. El cupón se canjea al emitir el comprobante y su descuento queda guardado en el documento. No canjees antes en Promociones un cupón que quieras aplicar en el cobro.

## Volver a cargar los ejemplos

El archivo [`supabase/seed-demo-clients.sql`](../supabase/seed-demo-clients.sql) es una carga opcional, separada del catálogo normal. Se puede ejecutar desde el editor SQL de Supabase después de aplicar las migraciones y cargar el catálogo.

Repetirlo conserva contraseñas existentes, visitas ya creadas y canjes. No restablece los escenarios al estado inicial ni duplica las cuentas. Las direcciones `example.com`, los nombres `[DEMO]`, las visitas y los beneficios son datos ficticios de prueba.
