# Conectar ejecuciones a ATLAS

El centro de automatizaciones funciona en modo local con registros manuales e importación JSON. La recepción automática necesita el proyecto Supabase de ATLAS activo. El frontend de Sites no despliega las funciones de Supabase.

## Preparación

1. Crea el proceso y su automatización en el espacio compartido. Copia sus identificadores desde «Integración».
2. Despliega `supabase/functions/automation-events` en ese mismo proyecto. La configuración incluida desactiva la validación JWT de la pasarela solo para esta función: el propio código valida un secreto independiente y limitado a una automatización.
3. Configura el secreto de servidor `ATLAS_AUTOMATION_TOKENS` como una lista JSON de objetos con `token`, `workspaceId`, `processId` y `automationId`. Genera un token aleatorio de al menos 32 caracteres para cada integración. No reutilices contraseñas ni introduzcas los tokens en el frontend, documentos, repositorios o enlaces.
4. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son secretos de servidor disponibles en las funciones. La clave de servicio nunca se entrega al navegador ni a la herramienta emisora. La integración solo recibe su token limitado.
5. Configura la herramienta emisora (Power Automate, n8n, Make o vuestro sistema) para enviar un POST al endpoint indicado abajo, conservando el token en su almacén seguro de credenciales.

## Petición

URL: `https://<proyecto>.supabase.co/functions/v1/automation-events`

Cabeceras: `Content-Type: application/json` y `Authorization: Bearer <token_de_integracion>`.

Descarga el ejemplo desde la automatización para obtener el cuerpo con sus IDs. No contiene credenciales. `run` incluye:

- `externalId`: identificador único y estable de la ejecución. Los reintentos deben conservarlo.
- `at`: fecha ISO 8601 con zona horaria.
- `status`: `success`, `partial` o `error`.
- `cases`: casos procesados; `errors`: casos con error.
- `durationSeconds`: duración de la ejecución, no tiempo de trabajo humano.
- `cost`: coste de esa ejecución en euros.
- `pendingExceptions`: casos pendientes de revisión, como máximo el total de casos.
- `detail`: resumen operativo sin datos personales ni secretos.

Respuesta 201: incorporada. Respuesta 200 con `duplicate: true`: ya estaba registrada. En errores 409 por concurrencia o errores 5xx, reintenta con el mismo ID y espera creciente. Los errores 400/401/403 requieren corregir datos o credenciales, no reintentos ilimitados. Se admiten hasta 32 KB por evento y 1.000 ejecuciones por automatización; el límite devuelve 409 y no descarta datos silenciosamente. Exporta el historial y crea un nuevo registro de automatización para continuar si alcanzas el límite.

Las actualizaciones usan la revisión del proceso para evitar sobrescribir cambios del equipo. Un token solo puede añadir ejecuciones a su combinación de espacio, proceso y automatización. Para revocar una integración, elimina su entrada de `ATLAS_AUTOMATION_TOKENS`.

## Comprobación de puesta en marcha

Envía una ejecución de prueba sin datos personales; verifica que aparece con origen «Conectada». Reenvíala y comprueba que no se duplica. Prueba con un token incorrecto y con otro proceso: deben rechazarse. Abre una ficha antes del envío e intenta guardar después: ATLAS debe pedir recargar si la revisión cambió.

ATLAS actualiza el espacio compartido cada minuto y al recuperar el foco. Las alertas se muestran en la aplicación mientras está abierta; no se envían correos ni notificaciones externas. «Pausar seguimiento» cambia los avisos de ATLAS y no detiene la herramienta de origen. Los costes de ejecuciones no se suman al ROI: incorpora los gastos reconciliados en la medición mensual para evitar duplicidades.

## Importación local

Usa un archivo JSON con una lista de objetos `run`, o un solo objeto. No incluyas el sobre `workspaceId/processId/automationId`. Todos los registros importados se identifican como «Importada», aunque el archivo contenga otro origen. Los registros de muestra del ejemplo son ficticios.
