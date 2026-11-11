# CRM de HOME: alcance y decisiones

Estado: primera entrega implementada localmente; migración aplicada al proyecto Supabase conectado. Falta configurar el backend y probar los flujos completos con cuentas autorizadas. Intervalos reales por servicio pendientes. Actualizado: 9 de noviembre de 2026.

## Objetivo confirmado

Aumentar el número de clientes que regresan durante los próximos 90 días. El CRM incluirá personas con cuenta, clientes atendidos en mostrador y prospectos. El seguimiento por WhatsApp preparará mensajes para revisión y envío humano. Cada encargado gestionará los clientes y las campañas de su sede; el propietario tendrá visión de todas las sedes.

La medida principal propuesta es **clientes que completan una segunda visita dentro de un plazo acordado**, por cohorte de primera visita y sede. Acompañarla con días entre visitas, citas completadas, bajas de comunicaciones y margen por visita cuando existan datos reales de cobro y costes. El plazo y las metas numéricas siguen pendientes; no se fijarán a partir de los registros DEMO.

## Punto de partida observado

- HOME ya registra citas de usuarios con cuenta, comprobantes internos, cupones, campañas de bienvenida/frecuencia/referidos y puntos. La consulta pública de una persona sin cuenta abre WhatsApp y no crea una cita en la base.
- Las citas y comprobantes están ligados a perfiles de Auth. El cobro busca clientes por correo exacto. Para incluir visitantes sin cuenta, la identidad comercial debe poder existir sin inicio de sesión y vincularse después a una cuenta.
- El panel del propietario carga listas completas desde `/api/owner/dashboard`. El nuevo directorio necesitará filtros, paginación y agregados en la API.
- Las migraciones están aplicadas en el proyecto Supabase conectado y las 15 tablas públicas tienen RLS activo. Los registros disponibles para pruebas son DEMO, así que no representan ventas ni retención reales.
- El comprobante HOME-I es un registro interno y, según la decisión del propietario, representa un pago ya cobrado. Sigue sin sustituir una factura electrónica fiscal.

## Implementación local actual

- `/admin` y `/encargado`: paneles con sidebar-07 adaptado al rol. Todas las secciones CRM están dentro del mismo shell; el propietario puede filtrar por sede y el encargado solo consulta su sucursal mediante API y RLS. Los enlaces antiguos `/admin/crm` y `/encargado/crm` redirigen al panel integrado.
- El formulario público registra una consulta de una persona sin cuenta antes de abrir WhatsApp. El alta manual y la importación CSV no asignan puntos ni cupones. Cada mensaje comercial comprueba consentimiento antes de abrir el chat y vuelve a comprobarlo al confirmar el envío.
- «Hoy» propone ofrecer próxima cita después de un comprobante, contactar a clientes cuyo intervalo de regreso venció y revisar cancelaciones futuras. Son sugerencias calculadas sobre una muestra acotada; no envían mensajes automáticamente. Los intervalos siguen etiquetados como DEMO hasta que se ajusten con cifras reales.
- «Resultados» suma comprobantes HOME-I de los últimos 90 días y separa las reservas/regresos declarados manualmente. No afirma atribución causal ni rentabilidad sin costes reales. La interfaz avisa cuando alcanza el límite de consulta.
- La migración `20261109202925_crm_contacts_manual_campaigns.sql` está aplicada al proyecto Supabase conectado. Las 11 tablas CRM tienen RLS activo y el historial previo de citas y comprobantes quedó vinculado a contactos. El entorno necesita `SUPABASE_SECRET_KEY` únicamente en el backend para registrar consultas públicas.
- La migración correctiva `20261109203936_crm_direct_contact_relationships.sql` también está aplicada. Añade las relaciones directas que PostgREST necesita para mostrar el contacto en Consultas, Seguimientos y destinatarios de campañas.

Verificación después de aplicar la migración: seis contactos registrados DEMO, cero citas o comprobantes sin contacto y ocho intervalos de servicio. El rol `anon` carece de lectura del CRM y de acceso al RPC de consultas; una cuenta de cliente DEMO autenticada tampoco puede leer contactos ni ajustes de marketing. Aún no hay una cuenta de encargado en el proyecto para probar su alcance por sede de extremo a extremo.

Quedan para una siguiente iteración la fusión asistida de duplicados y el enlace de historial previo a una cuenta nueva, segmentos avanzados reutilizables, lista de espera y atribución conciliada con cobros. Estos flujos requieren pruebas con el esquema desplegado y datos reales antes de habilitarlos.

## Modelo de trabajo propuesto

El recorrido principal será **contacto → solicitud → cita confirmada → visita completada → nueva reserva**. Las consultas que aún no producen una reserva tendrán un estado de prospecto y una tarea de seguimiento. Un embudo de oportunidades más complejo solo tendría sentido para ventas que realmente requieran cotización o negociación.

### Entrega 1: datos y operación diaria

1. **Contactos unificados:** ficha con identidad, sede relacionada, origen, preferencias, consentimiento comercial, historial de citas/visitas, comprobantes, cupones, referidos, notas y tareas. Contactos sin cuenta; vinculación posterior con Auth y revisión asistida de duplicados. Los clientes sin cuenta tienen historial comercial, pero no acumulan puntos ni reciben cupones hasta crear una cuenta.
2. **Entrada de contactos:** captura desde el formulario público antes de abrir WhatsApp, alta manual e importación CSV. Una apertura de WhatsApp se registrará como *intención de contacto*, no como conversación confirmada.
3. **Pantalla «Hoy»:** solicitudes pendientes, clientes a quienes conviene ofrecer la siguiente cita al terminar su visita, inactivos y huecos generados por cancelaciones. Cada fila tendrá responsable, siguiente acción y vencimiento.
4. **Seguimiento humano:** plantillas editables para WhatsApp, vista previa, apertura del chat y registro manual de resultado. El encargado de cada sede revisa y envía; el propietario supervisa. Sin integración oficial no se puede verificar automáticamente si el mensaje se envió, fue leído o recibió respuesta.
5. **Permisos y rendimiento:** propietario con alcance global; encargado con acceso solo a información y acciones de su sede. Consultas paginadas, filtros en servidor, agregados y RLS específicos de cada nuevo recurso.

### Entrega 2: marketing medible

1. **Segmentos dinámicos:** nuevo, habitual, próximo a regresar, inactivo y alto gasto; reglas configurables por recencia, frecuencia, servicio, sede y gasto documentado.
2. **Campañas con audiencia:** reutilizar las promociones actuales y añadir selección de segmento, oferta, periodo, responsable, tope de contactos, lista de exclusión y revisión previa. Guardar consentimiento y bajas por canal.
3. **Resultados:** contactos elegibles, mensajes marcados como enviados, reservas atribuidas por código o enlace, visitas completadas, descuentos y valor documentado. Mostrar atribución como estimación cuando el cliente pueda volver por otros motivos.
4. **Pruebas de mejora:** comparar cohortes y, cuando el volumen lo permita, reservar un grupo de control para estimar el efecto incremental de un seguimiento. Vigilar que el margen y las bajas no empeoren.

### Entrega 3: ampliaciones según resultados

Lista de espera, recomendaciones de servicios, paquetes o membresías, productos, integraciones de mensajería y automatización de envío. Su prioridad dependerá de la capacidad operativa, el margen y los resultados observados de las primeras entregas.

## Pantallas del propietario

La navegación de propietario y encargados usa el bloque shadcn sidebar-07: grupos de operación, CRM y administración, con estado activo, colapso a iconos y menú móvil. El panel de empleados muestra agenda y horario según su rol. El directorio abre una ficha con línea de tiempo y acciones; el sidebar mantiene la navegación visible al cambiar de sección.

## Decisiones pendientes

1. Intervalo normal entre visitas por servicio. Se cargarán valores DEMO editables hasta recibir los valores reales; esas reglas estarán identificadas como DEMO.

## Escenario DEMO para diseñar los reportes

Los siguientes números son **supuestos inventados**, no datos de HOME ni metas acordadas. Sirven para comprobar que las pantallas, fórmulas y filtros explican bien la economía antes de conectar cifras reales.

| Variable | Supuesto DEMO |
| --- | ---: |
| Visitas atendidas en un mes | 200 |
| Ticket medio documentado | ₡9.500 |
| Coste variable medio por visita | ₡2.000 |
| Contribución media por visita | ₡7.500 |
| Clientes de primera visita en una cohorte | 80 |
| Clientes de esa cohorte que vuelven dentro de 60 días | 28 |
| Tasa de segunda visita de esa cohorte | 35 % |
| Presupuesto mensual de marketing | ₡60.000 |

Ejemplo de cálculo: 28 / 80 = 35 %. Si una prueba bien controlada mostrara 12 visitas adicionales atribuibles al seguimiento, la contribución adicional antes del presupuesto sería 12 × ₡7.500 = ₡90.000; tras ₡60.000 de gasto quedaría ₡30.000. Sin comparación válida, esas 12 visitas serían solo una hipótesis.

## Referencias de producto

- [Zoho CRM: segmentación por recencia, frecuencia y gasto](https://help.zoho.com/portal/en/kb/crm/experience-center/segmentation/articles/segmentation).
- [HubSpot: tareas y acciones de seguimiento en workflows](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions).
- [Pipedrive: conversión de prospectos por origen](https://support.pipedrive.com/en/article/insights-reports-lead-conversion).
- [Fresha: segmentos de clientes](https://www.fresha.com/help-center/knowledge-base/clients/100685-segment-your-clients) y [comunicaciones alrededor de la cita](https://www.fresha.com/help-center/knowledge-base/calendar/130-send-appointment-updates).

Estas referencias muestran capacidades de los productos; no son estimaciones de mejora para HOME.
