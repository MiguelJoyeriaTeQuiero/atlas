# ATLAS

Programa de automatización y mejora operativa para Joyería Te Quiero y Te Quiero Metales.

## Qué incluye

Aplicación Next.js y React en español, diseñada para escritorio y móvil. Permite registrar procesos y sesiones, adjuntar evidencias, ordenar oportunidades con criterios explicables, conservar una línea base, registrar observaciones mensuales y exportar PDF, PowerPoint, CSV y copias completas ZIP con adjuntos.

El espacio inicial está vacío. La demostración se abre de forma explícita y utiliza un almacenamiento separado. Ninguna cifra ficticia se incorpora a los resultados reales.

### Ampliación operativa

- **Mapa de procesos:** pasos ordenados por departamento, tiempos activos y esperas, traspasos, posibles recapturas de un dato y relaciones de entrada/salida entre procesos.
- **Implantaciones:** tareas con responsables, fechas, presupuesto, dependencias, criterios y evidencia de aceptación; comentarios e historial de actividad. Completar una tarea exige aceptación documentada y dependencias terminadas. Los presupuestos de tareas son planificación y no se añaden otra vez al ROI. Dirección conserva el acceso de consulta.
- **Centro de automatizaciones:** registros manuales, importación JSON con deduplicación, estado, costes, frecuencia esperada y resolución de excepciones. Las alertas se calculan mientras ATLAS está abierto. Pausar el seguimiento no detiene la herramienta emisora.
- **Resultados ampliados:** escenarios conservador/esperado/optimista, mantenimiento e IA adicionales, fuente de supuestos, reparto de beneficios compartidos y revisión de posibles solapamientos. Importación CSV con vista previa, atómica y sin sobrescritura de periodos. Los datos importados necesitan validación posterior.
- **Biblioteca de mejoras:** procedimientos versionados, publicación vinculada a una medición comparable validada de un proceso implantado, despliegues por tienda, requisitos, adopción y resultados normalizados por 100 casos dentro de un grupo y mes. Las observaciones de meses anteriores y las versiones del procedimiento se conservan. Los resultados de tiendas no se suman automáticamente al ROI del proceso.

Los módulos se guardan dentro de la ficha del proceso y conservan compatibilidad con las copias de formato 1. Las copias ZIP incluyen todos los nuevos datos. El informe PDF incorpora mapa, tareas, automatizaciones y despliegues. El espacio de demostración incorpora ejemplos de los cinco módulos y mantiene su selección al recargar dentro de la misma sesión.

La recepción automática de ejecuciones requiere desplegar `supabase/functions/automation-events` y configurar secretos limitados a cada automatización. No se activa por publicar el frontend. La guía completa está en `public/documents/ATLAS_Integracion_automatizaciones.md`. Sin esa configuración, los registros manuales y las importaciones funcionan normalmente. No se añaden tablas ni se cambian los roles existentes.

## Estado de la entrega

- La versión de revisión publicada utiliza el modo local, con datos y archivos guardados en IndexedDB del navegador. Cada navegador y dispositivo tiene su propio espacio. Es obligatorio exportar copias para conservar el trabajo fuera del navegador. Este modo permite empezar las entrevistas, pero no comparte los registros con Dirección.
- El código para Supabase Auth, PostgreSQL, políticas de acceso, almacenamiento privado y propuestas de IA está incluido. Requiere provisionar y conectar un proyecto del titular.
- Vercel es el destino de producción solicitado. El proyecto contiene la configuración y exportación estática de Next.js para desplegarlo allí. La publicación de revisión en Sites no equivale a un despliegue en la cuenta Vercel.
- La IA conectada necesita una clave de API configurada en el servidor. Las suscripciones de ChatGPT o Claude no se usan como credenciales de API. El briefing copiable y las recomendaciones explícitas por reglas funcionan sin esa integración.

## Desarrollo

Requiere Node.js 22 o superior y pnpm 11.25.0.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

La compilación genera `out/`. El frontend es estático y utiliza Supabase directamente bajo las reglas de acceso de la base de datos. No contiene claves privadas de proveedores ni una clave `service_role`.

## Preparar Supabase

1. Crear o seleccionar un proyecto autorizado. Elegir ubicación y condiciones adecuadas para los datos que se incorporarán.
2. Aplicar `supabase/migrations/001_atlas.sql` en el editor SQL o mediante el flujo de migraciones de Supabase.
3. Desactivar el registro público si el proyecto se dedica a esta aplicación. Crear los usuarios previstos desde la administración de Auth. Las credenciales se entregan por el mecanismo seguro de la organización.
4. Crear un espacio y asignar los usuarios desde SQL. Copiar sus UUID reales de Auth; no utilizar identificadores inventados.

```sql
insert into public.atlas_workspaces (name)
values ('ATLAS JTQ y TQM') returning id;

-- Sustituir los valores entre < > por los UUID verificados.
insert into public.atlas_memberships (workspace_id, user_id, role) values
  ('<workspace_uuid>', '<miguel_user_uuid>', 'admin'),
  ('<workspace_uuid>', '<direccion_user_uuid>', 'director');
```

5. Verificar las políticas con dos usuarios y una cuenta sin pertenencia al espacio. El administrador puede escribir, Dirección solo puede consultar y descargar, y un usuario ajeno no puede leer registros ni archivos.
6. Configurar las variables públicas `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en Vercel antes de compilar. Para la revisión también pueden introducirse URL y clave pública en Configuración. Se rechazan claves `service_role` y claves secretas.
7. Iniciar sesión en la app. El espacio cloud comienza vacío y mantiene separados los datos locales. Para migrar lo recogido localmente, exportar un ZIP completo, iniciar sesión y usar Importar copia. En cloud solo se añaden IDs nuevos, dentro de una transacción, para evitar sobrescribir trabajo de otra sesión.

La base de datos usa revisiones optimistas. Si dos sesiones intentan modificar la misma versión de un registro, la segunda recibe un conflicto y debe recargar antes de guardar. Las escrituras se ejecutan por funciones que comprueban la pertenencia y el rol. El navegador no puede autoconcederse acceso ni modificar las membresías.

## Desplegar en Vercel

Importar el repositorio o ejecutar el flujo oficial de despliegue desde la cuenta autorizada. Vercel reconoce Next.js. La configuración de `vercel.json` fija la compilación y cabeceras básicas. Mantener **Framework Preset: Next.js** y desactivar **Override** en **Output Directory** dentro de los ajustes de compilación de Vercel. Aunque la exportación estática genera `out/`, Vercel debe detectar la salida automáticamente: forzar `out` hace que busque allí `routes-manifest.json`, que se genera en `.next/`. Para usar Supabase, añadir las dos variables públicas antes de desplegar.

Configurar los dominios autorizados en Supabase Auth. Realizar una prueba completa con las cuentas definitivas y un adjunto de ejemplo anonimizado. Confirmar que Dirección no puede modificar información. Comprobar que un usuario sin membresía no puede acceder al contenido aunque conozca la URL.

No publicar datos personales reales hasta que la organización haya validado el tratamiento, los accesos y las condiciones de los proveedores. La confirmación de anonimización de la aplicación registra la revisión del usuario; no elimina automáticamente caras, voces, identificadores ni metadatos.

## Propuestas de IA

La recomendación local está identificada como recomendación por reglas. Examina la descripción del proceso y propone una orientación inicial. No consulta a un modelo ni acredita viabilidad o precio.

`supabase/functions/analyze/index.ts` permite generar una propuesta adicional con un proveedor configurado. Antes de activarla:

1. Revisar el código y los proveedores permitidos.
2. Configurar los secretos y el modelo que indica el encabezado de la función.
3. Desplegar la función `analyze` en el mismo proyecto.
4. Probar autenticación, autorización de administrador, tratamiento de entradas y fallos del proveedor.
5. Verificar que solo se transmite el texto anonimizado necesario. Los vídeos y archivos adjuntos no se envían a un modelo automáticamente.

La función redacta propuestas; no ejecuta cambios en ERP, pagos, nóminas, campañas ni otros sistemas. La autonomía de cada futura automatización deberá diseñarse y probarse dentro de su propio proyecto.

## Medición y límites de los resultados

Los pesos iniciales de impacto son una propuesta: tiempo 30, coste 22, errores 16, velocidad 10, trazabilidad 8, decisiones 6, ventas 5 y servicio 3. Pueden editarse. La puntuación se ajusta por complejidad, riesgo, preparación de datos y calidad de evidencia. No sustituye la aprobación de Dirección.

El tiempo por caso es tiempo activo y excluye el retrabajo. Las personas por caso son personas que trabajan simultáneamente en ese caso; no es la plantilla total. La carga del proceso común de tiendas debe especificar si el volumen ya incluye las 18 tiendas para evitar multiplicar dos veces.

La línea base conserva los valores y su fecha. Se permite documentar la fuente y validar la misma muestra posteriormente. Un cambio material del proceso requiere una nueva ficha o una nueva comparación planificada; no debe reescribirse el pasado.

El ahorro de caja previsto y el valor de la capacidad liberada se muestran separados. La conversión de horas a ahorro de caja empieza en 0 %. La inversión inicial prevista no acredita el ROI observado. Para este se necesita inversión real validada con fuente, costes operativos reales y ahorros de caja verificados en los meses cubiertos.

Las comparaciones verificadas requieren una línea base con fuente y validación, una medición con casos observados, fuente y validación. Esta validación es interna y debe corresponder a evidencia conservada. La app no realiza una auditoría independiente.

La cartera señala grupos de beneficios compartidos cuyo reparto supera el 100 % y posibles coincidencias de fuente o dato capturado. Son indicios para revisión, no una auditoría automática. El reparto se aplica a las previsiones; cada medición real debe registrar solo importes ya atribuidos, sin duplicaciones. El ROI observado agregado queda pendiente si un grupo cubierto conserva un reparto superior al 100 %. Los procesos descartados no forman parte del escenario previsto.

## Copias y archivos

- Adjuntos de hasta 50 MB por archivo; el proyecto Supabase debe permitir ese límite. Dividir o comprimir vídeos mayores.
- PDF, fotos, vídeos y documentos se guardan como evidencia, sin extracción o transcripción automática.
- Exportar ZIP al terminar cada jornada. Incluye registros y bytes de los adjuntos.
- Importar un ZIP en modo local sustituye los registros tras confirmación. Se conserva internamente una instantánea de los registros anteriores, pero la recuperación normal debe realizarse desde una copia exportada.
- La importación cloud añade registros nuevos de forma atómica. Si hay IDs repetidos, se rechaza y se conserva el espacio actual.
- Un PDF o PowerPoint es una instantánea. Las modificaciones posteriores requieren una nueva exportación.

## Estructura del proyecto

```text
app/                         Next.js y estilos
components/AtlasApp.tsx       Interfaz del programa
lib/domain.ts                Modelo, fórmulas y validación
lib/domain.test.ts           Pruebas de cálculos y validación
lib/store.ts                 Persistencia, usuarios, adjuntos y copias
lib/exports.ts               PDF, PowerPoint y CSV
supabase/migrations/          Base de datos, acceso y escrituras
supabase/functions/analyze/   Propuestas de IA en servidor
public/documents/            Plan y material para comité
```

## Referencias consultadas

- Next.js, exportación estática: https://nextjs.org/docs/app/guides/static-exports
- Supabase, acceso por fila: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, almacenamiento privado: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Vercel, variables de entorno: https://vercel.com/docs/environment-variables
- AEPD, datos seudonimizados: https://www.aepd.es/preguntas-frecuentes/0-conceptos-basicos/FAQ-0006-sobre-los-datos-seudonimizados

Consulta realizada el 4 de noviembre de 2026. Las decisiones de método y los pesos son propuestas de esta entrega. El alcance y las herramientas actuales proceden de la información facilitada por Miguel Ángel.
# Apariencia

El selector de la barra superior permite usar el tema claro, oscuro o el del sistema. La preferencia se conserva en el navegador y se sincroniza entre sus pestañas. Los documentos impresos conservan el fondo claro.

## Puestos y tareas a partir de PDF

Desde **Puestos y tareas**, incorpora una descripción de puesto, indica su departamento y empresa y añade las personas que lo ocupan. ATLAS lee el texto con PDF.js y reconoce páginas escaneadas en español con Tesseract. Los lectores, fuentes y modelos se sirven desde la propia aplicación; el PDF no se envía a un proveedor de IA para preparar el borrador.

La preparación es una extracción local por reglas de funciones y responsabilidades escritas en el PDF, con página y fragmento de origen. No es un análisis generativo ni deduce funciones ausentes. Cada tarea comienza **Por confirmar**. En la revisión puedes asignar una persona, marcar **Manual**, **Parcialmente automatizada** o **Automatizada**, anotar herramientas y hechos, añadir tareas o descartar propuestas conservando su fuente. Las oportunidades creadas desde tareas manuales o parciales conservan el vínculo con el documento; no añaden estimaciones de tiempo o ahorro.

En **Sesiones de trabajo → Tareas precargadas** aparecen los puestos vigentes del departamento y empresa elegidos. Guarda primero la sesión para vincular las revisiones a ella. Las clasificaciones y notas de tarea se guardan al instante; el resto de notas de la sesión se guarda con su botón habitual. El guion puede descargarse en Markdown.

Límites: 20 MB, 40 páginas, 120.000 caracteres de texto y 200 propuestas por documento. Los PDF protegidos necesitan una copia desbloqueada. Las páginas ilegibles y lecturas de baja confianza se señalan para revisión. Las copias completas incluyen tanto los PDF como los puestos, asignaciones y clasificaciones. Archivar un puesto conserva su historial y lo retira de las nuevas preparaciones.

`pnpm run prepare:documents` prepara los recursos locales del lector; `pnpm run build` lo ejecuta automáticamente. El módulo utiliza los registros de evidencias y el almacenamiento existentes, sin migraciones nuevas. La verificación funcional se realiza con documentos ficticios en el espacio de demostración.

