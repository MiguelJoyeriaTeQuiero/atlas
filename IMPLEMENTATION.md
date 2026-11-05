# ATLAS · Ampliación de inteligencia operativa

Alcance autorizado: funciones 1–7; sin base comercial ni paquetes sectoriales. Conservar datos, módulos existentes, modo local/demostración/cloud, permisos y copias. Mantener cambios locales hasta revisión; no publicar automáticamente.

## Entregables

- [x] Entrevistas, revisión y oportunidad; servidor de enlace privado implementado y probado con servicios simulados.
- [x] Hallazgos transversales con evidencias, validación y creación de oportunidad.
- [x] Minería CSV: mapeo, validación, variantes, tiempos y transiciones.
- [x] Propuestas con tareas, dependencias, criterios y borrador n8n desactivado.
- [x] Alertas persistentes y función de seguimiento programable implementada.
- [x] Simulación con presupuesto, dependencias y capacidad; hipótesis visibles.
- [x] Conocimiento versionado, documentos/transcripciones y consulta con fuentes.
- [x] Revisión local de siete recorridos, móvil y escritorio, claro/oscuro y teclado.
- [ ] Activación remota: desplegar funciones, configurar proveedor y programación; probar cuenta de Dirección, participante externo, IA y transcripción reales. Se mantiene la autorización previa de trabajar solo en local.

## Dirección de diseño

Sobriedad inspirada en aplicaciones Apple: superficies neutrales, acento azul, tipografía de sistema (preferencia expresa del usuario), separación por espacio, jerarquía clara, navegación agrupada y progresión de tareas. Sin ruido decorativo. Controles de 40–44 px, foco visible y movimiento reducido. Formularios extensos en página; diálogos para acciones acotadas. Estados vacíos con próximo paso, errores junto a la acción y confirmación de guardado.

## Arquitectura

Registros nuevos tipados dentro de evidencias para conservar el esquema y copias existentes, con validación explícita y conflictos de edición. IA mediante funciones de servidor, credenciales nunca en cliente. Enlaces de entrevista con secreto aleatorio, hash almacenado, caducidad/revocación y contexto mínimo. Cálculos deterministas independientes de IA. Funciones externas requieren conexión y configuración real, visible en producto; no simular disponibilidad.

## Verificación

70 pruebas pasan, incluidas cálculos, importación, validación, aislamiento de enlaces, fallos del proveedor, autorizaciones, notificaciones y conflictos. Tipado de frontend y handlers correcto. Compilación de producción y exportación estática correctas.

Navegador local: entrevista → respuesta → revisión → oportunidad; hallazgo → confirmación; CSV → mapeo → análisis → guardado; propuesta → revisión de pasos → aprobación → tareas; escenario → supuestos → guardado; procedimiento → dos versiones → consulta de fuentes; seguimiento → comprobación → alerta revisada → recarga. Todos los datos de estas pruebas permanecen en la demostración separada. Se volvió al espacio real al terminar.

Revisión visual de 320 y 390 px y escritorio de 1280 px. Corregidos calendario aislado, pestañas cortadas a 320 px, acciones pegadas al texto, menú sin aislamiento del foco y sobrescritura de borradores tras una actualización. Las tablas conservan su desplazamiento dentro del panel. Se revisó modo claro y oscuro. No se certifica Safari/iOS físico ni accesibilidad completa mediante lector de pantalla.

El proyecto Supabase ATLAS no tiene funciones desplegadas en la consulta realizada. No se ha publicado código, cambiado datos remotos ni configurado notificaciones. La comprobación de handlers usa peticiones simuladas. El flujo n8n exportado no se ha ejecutado en un servidor n8n.

## Revisión heurística

Valoración provisional: **9/10 para los recorridos locales revisados**, no una certificación del producto completo. Sin incidencias mayores observadas en esos recorridos después de las correcciones. Incidencia menor pendiente (severidad 2): activar las funciones conectadas requiere instrucciones externas y configuración técnica. Para alcanzar 10/10 en ese diagnóstico concreto: completar la activación, verificar estados de conexión reales y contrastar su claridad con un usuario que no conozca Supabase. La evaluación con usuarios y dispositivos reales puede descubrir problemas adicionales.
