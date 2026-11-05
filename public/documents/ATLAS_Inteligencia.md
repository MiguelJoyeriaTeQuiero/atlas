# ATLAS · Conectar inteligencia y seguimiento

Los módulos de hallazgos, importación CSV, propuestas por reglas, simulación y documentos funcionan localmente. La IA, los enlaces privados y el seguimiento sin navegador requieren el espacio Supabase configurado. Publicar el frontend en Vercel no despliega estas funciones.

## Funciones de servidor

Desplegar `intelligence`, `interview` y `monitor` junto con sus archivos `_shared`. Conservar `automation-events` para recibir ejecuciones. Los nuevos registros usan `atlas_records` con `kind = evidence`; no requieren tablas nuevas ni cambios de permisos.

- `intelligence` exige JWT de usuario, pertenencia al espacio e IA habilitada. Solo permite a Dirección consultar documentos publicados; las demás operaciones requieren administrador.
- `interview` valida un secreto aleatorio de 256 bits, cuyo hash se guarda con caducidad de siete días y revocación. El enlace solo expone su entrevista. El secreto viaja en el fragmento de la URL y en el cuerpo de la solicitud, nunca en parámetros de consulta. No registrar cuerpos de solicitudes.
- `monitor` exige un secreto exclusivo de servidor y una lista de espacios autorizados. No admite llamadas de navegadores.

La configuración de autenticación sigue la [referencia oficial de cabeceras y verificación JWT](https://supabase.com/docs/guides/functions/auth-headers): `intelligence` conserva la comprobación JWT de la plataforma y verifica además usuario y pertenencia dentro de la función. Las otras dos funciones validan sus secretos específicos.

Revisar los cambios localmente y probar en un entorno de revisión antes de producción. En Supabase CLI 3, consultar `supabase functions deploy --help` para seleccionar explícitamente el proyecto remoto; no asumir los indicadores de versiones antiguas.

## Configuración de IA

Configurar secretos en Supabase, nunca en variables `NEXT_PUBLIC_`:

- `ATLAS_AI_PROVIDER`: `openai` o `anthropic`.
- `ATLAS_AI_MODEL`: identificador de un modelo habilitado en la cuenta del proveedor.
- `OPENAI_API_KEY` o `ANTHROPIC_API_KEY`, según el proveedor.
- `ATLAS_TRANSCRIPTION_MODEL`: modelo de transcripción de OpenAI habilitado. La transcripción requiere `OPENAI_API_KEY`, incluso si la generación de texto usa Anthropic.
- `ATLAS_ALLOWED_ORIGINS`: dominios HTTPS autorizados separados por comas; añadir el origen local solo para pruebas.

Activar la IA en Configuración de ATLAS. Cada acción utiliza los registros guardados del espacio: conservar texto revisado y autorizado para su tratamiento. Las consultas de conocimiento solo usan documentos publicados y devuelven fuentes. Las respuestas no ejecutan cambios en sistemas externos.

## Seguimiento programado

1. Crear el registro de seguimiento desde Automatizaciones, realizar una comprobación manual y activar «Incluir en las comprobaciones programadas».
2. Configurar `ATLAS_MONITOR_SECRET` con un valor aleatorio de al menos 32 caracteres y `ATLAS_MONITOR_WORKSPACES` con los UUID autorizados, separados por comas.
3. Programar en Supabase Cron una llamada POST a `/functions/v1/monitor`, por ejemplo cada hora. Guardar el secreto en Vault y utilizarlo como `Authorization: Bearer …`; no pegarlo en código del navegador ni en el repositorio.
4. Comprobar en ATLAS la fecha de la última ejecución del servidor, un fallo deliberado con datos de prueba y su resolución posterior.

Para avisos fuera de ATLAS, configurar `ATLAS_NOTIFICATION_WEBHOOKS` como un objeto por UUID de espacio, con `{ "url": "https://destino-autorizado", "token": "secreto-del-destino" }`. El token es opcional. Los destinos reciben identificadores y título de alerta, sin documentos ni respuestas de entrevistas. Deben deduplicar por la cabecera `Idempotency-Key`. Los fallos se reintentan en la siguiente comprobación y se muestran en ATLAS. No hay un proveedor de correo activado automáticamente.

La opción del navegador solicita seguimiento; no crea el trabajo Cron. La fecha «Servidor» acredita que una comprobación se ha ejecutado. Revisar los logs de Cron y la función si deja de actualizarse.

## Prueba de los enlaces

Crear un enlace desde una entrevista guardada. Abrirlo en una sesión sin login, contestar, enviar y comprobar los resultados desde la cuenta del responsable. Probar revocación, caducidad, cambios simultáneos y un token inventado. Las respuestas permanecen como declaraciones hasta su revisión. El participante puede aceptar o rechazar IA; con la guía local siguen guardándose sus respuestas.

## Importación de eventos

CSV UTF-8 con identificador de caso, actividad y fecha ISO con zona horaria. Son opcionales: identificador de evento, recurso, minutos activos y coste. Hasta 3.000 eventos guardados por registro. Los duplicados exactos se excluyen; un identificador repetido con contenido diferente bloquea la importación. La mediana de tiempo transcurrido no equivale a tiempo de trabajo. Definir la actividad de cierre para distinguir casos terminados y sin cierre observado.

## Propuestas, simulación y conocimiento

Las propuestas iniciales son reglas explícitas; la revisión con IA es una acción separada. La exportación n8n es un piloto desactivado: inicio manual, contexto, aprobación y webhook de prueba. No implementa automáticamente una integración ERP. Los costes son declarados y deben contrastarse.

El simulador utiliza una selección orientativa por beneficio/coste con dependencias, no un optimizador exacto. Conserva los supuestos y recalcula con las fichas actuales. No incorpora resultados a las mediciones verificadas.

Los procedimientos requieren responsable y fuentes antes de publicar. Se conservan hasta 20 versiones y puede restaurarse una anterior como borrador. Los documentos archivados y borradores no responden consultas. Las grabaciones admiten hasta 20 MB; la transcripción y cualquier procedimiento generado requieren revisión.
