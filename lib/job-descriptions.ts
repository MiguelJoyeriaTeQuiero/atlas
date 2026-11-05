import type { Company, DepartmentId, Evidence, Session } from './domain';

export const AUTOMATION_LABELS = { pending: 'Por confirmar', manual: 'Manual', partial: 'Parcialmente automatizada', automated: 'Automatizada' } as const;
export type AutomationLevel = keyof typeof AUTOMATION_LABELS;
export interface DocumentPage { number: number; text: string; method: 'text' | 'ocr'; }
export interface JobTask {
  id: string; title: string; assignee: string; automation: AutomationLevel;
  systems: string; notes: string; excluded: boolean;
  source: { page: number; quote: string } | null;
  origin: 'document' | 'added'; reviewedIn?: string; updatedAt: string;
}
export interface JobDescription {
  version: 1; company: Company; role: string; members: string[];
  pages: DocumentPage[]; tasks: JobTask[]; fileHash: string; updatedAt: string;
  warnings: string[]; archived: boolean;
}
export type JobDocument = Evidence & { departmentId: DepartmentId; jobDescription: JobDescription };
export const MAX_PDF_SIZE = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;
export const MAX_DOCUMENT_TEXT = 120_000;
export const MAX_JOB_TASKS = 200;
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const now = () => new Date().toISOString();
export const isJobDocument = (e: Evidence): e is JobDocument => !!e.jobDescription && !!e.departmentId;
export const splitMembers = (value: string) => [...new Set(value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean))];

const action = /^(?:realizar|gestionar|coordinar|revisar|supervisar|preparar|elaborar|registrar|controlar|atender|organizar|analizar|actualizar|comprobar|verificar|tramitar|mantener|emitir|conciliar|recibir|enviar|resolver|asegurar|garantizar|ejecutar|planificar|llevar|archivar|apoyar|participar|colaborar|reportar|informar|administrar|procesar|validar|crear|cargar|descargar|recopilar|consolidar|hacer|dar|realiza|gestiona|coordina|revisa|supervisa|prepara|elabora|registra|controla|atiende|organiza|analiza|actualiza|comprueba|verifica|tramita|mantiene|emite|concilia|recibe|envia|resuelve|asegura|garantiza|ejecuta|planifica|archiva|apoya|participa|colabora|reporta|informa|administra|procesa|valida|crea|carga|descarga|recopila|consolida)\b/i;
const dutyNouns = /^(?:gestion|coordinacion|revision|supervision|preparacion|elaboracion|registro|control|atencion|organizacion|analisis|actualizacion|comprobacion|verificacion|tramitacion|mantenimiento|emision|conciliacion|recepcion|envio|resolucion|ejecucion|planificacion|archivo|seguimiento|facturacion|apoyo|administracion|procesamiento|validacion|creacion|carga|descarga|recopilacion|consolidacion|cierre|apertura|inventario|reposicion|venta|cobro|comunicacion)\b/i;
const responsibilityHeading = /^(?:(?:\d+[.)]?\s+)?)(?:funciones|responsabilidades|tareas|actividades|principales funciones|principales responsabilidades|funciones principales|responsabilidades principales|funciones y responsabilidades|responsabilidades del puesto|funciones del puesto|mision|objetivo del puesto)\b/i;
const excludedHeading = /^(?:\d+[.)]?\s+)?(?:requisitos|formacion|experiencia|competencias|habilidades|conocimientos|condiciones|retribucion|salario|titulacion|perfil|dependencia|reporta a|relaciones|identificacion|datos del puesto|ubicacion|horario|jornada)\b/i;
const cleanBullet = (line: string) => line.replace(/^\s*(?:[•●▪◦·\-*–—]+|\d{1,2}[.)]|[a-z][.)])\s*/, '').trim();

/** Extract operational duties, never infer automation or invent department tasks. */
export function suggestJobTasks(pages: DocumentPage[]): { tasks: JobTask[]; warnings: string[] } {
  const tasks: JobTask[] = [], seen = new Set<string>(), warnings: string[] = [];
  let inDuties = false, inExcluded = false;
  for (const page of pages) {
    const lines = page.text.replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
    const blocks: string[] = [];
    for (const raw of lines) {
      const line = cleanBullet(raw), key = normalize(line);
      const heading = line.length < 100 && (responsibilityHeading.test(key) || excludedHeading.test(key));
      const startsTask = action.test(key) || dutyNouns.test(key) || /^[•●▪◦·\-*–—]|^\d{1,2}[.)]\s/.test(raw);
      if (blocks.length && !heading && !startsTask && blocks[blocks.length - 1].length < 900 && !/[.;:]$/.test(blocks[blocks.length - 1]) && line.length > 3 && !/^\d+$/.test(line)) blocks[blocks.length - 1] += ' ' + line;
      else blocks.push(line);
    }
    for (const block of blocks) {
      const key = normalize(block);
      if (block.length < 100 && excludedHeading.test(key)) { inExcluded = true; inDuties = false; continue; }
      if (block.length < 100 && responsibilityHeading.test(key)) {
        inDuties = true; inExcluded = false;
        const after = block.match(/^[^:]+:\s*(.{15,})$/)?.[1];
        if (!after) continue;
      }
      if (inExcluded) continue;
      const content = block.replace(/^(?:funciones|responsabilidades|tareas|actividades)\s*:\s*/i, '');
      for (const sentence of content.split(/;\s+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/)) {
        const text = cleanBullet(sentence).replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim(), normalized = normalize(text);
        if (text.length < 15 || text.length > 900 || seen.has(normalized)) continue;
        // Generic attributes, salary and qualification bullets are not tasks.
        if (/^(?:capacidad|orientacion|proactividad|experiencia|formacion|conocimiento|disponibilidad|titulacion|se requiere|se valorara|salario|idiomas|trabajo en equipo)\b/.test(normalized)) continue;
        if (!action.test(normalized) && !dutyNouns.test(normalized) && !(inDuties && /\b(?:debe|responsable de|se encarga de)\b/.test(normalized))) continue;
        if (tasks.length === MAX_JOB_TASKS) { if (!warnings.length) warnings.push(`Se han preparado las primeras ${MAX_JOB_TASKS} tareas. Revisa el texto completo para añadir las restantes.`); continue; }
        seen.add(normalized);
        tasks.push({ id: crypto.randomUUID(), title: text.slice(0, 300), assignee: '', automation: 'pending', systems: '', notes: '', excluded: false, source: { page: page.number, quote: text }, origin: 'document', updatedAt: now() });
      }
    }
  }
  if (!tasks.length) warnings.push('No se han identificado funciones con suficiente claridad. Revisa el texto leído y añade las tareas que correspondan.');
  return { tasks, warnings };
}

export function documentsForSession(evidence: Evidence[], session: Pick<Session, 'company' | 'departmentId'>): JobDocument[] {
  return evidence.filter(isJobDocument).filter(e => !e.jobDescription.archived && e.departmentId === session.departmentId && (session.company === 'Ambas' || e.jobDescription.company === 'Ambas' || e.jobDescription.company === session.company));
}
export function questionsForTask(task: JobTask): string[] {
  return [
    task.automation === 'pending' ? '¿Se realiza esta tarea? ¿Es manual, parcial o está automatizada?' : `Figura como ${AUTOMATION_LABELS[task.automation].toLowerCase()}. ¿Qué pasos siguen requiriendo intervención?`,
    '¿Quién la realiza y qué herramientas o sistemas utiliza?',
    '¿Cuántas veces se repite y cuánto tiempo consume cada caso?',
    '¿Qué errores, esperas y excepciones aparecen? ¿Podemos ver un caso real?',
  ];
}
export function taskGuide(documents: JobDocument[], title: string): string {
  return `# ${title}\n\nBorrador para contrastar con el equipo. Las tareas proceden de descripciones de puesto y no acreditan la actividad real.\n\n` + documents.map(e => {
    const d = e.jobDescription;
    return `## ${d.role}\nDocumento: ${e.fileName || e.name}\nPersonas: ${d.members.join(', ') || 'Por asignar'}\n\n` + d.tasks.filter(t => !t.excluded).map(t => `### ${t.title}\n- Estado: ${AUTOMATION_LABELS[t.automation]}\n- Persona: ${t.assignee || 'Por asignar'}\n- Fuente: ${t.source ? `página ${t.source.page} — «${t.source.quote}»` : 'Añadida durante la revisión'}\n- Herramientas: ${t.systems || 'Por confirmar'}\n- Notas: ${t.notes || 'Sin notas'}\n${questionsForTask(t).map(q => '- ' + q).join('\n')}`).join('\n\n');
  }).join('\n\n');
}

export function validateJobDescription(value: unknown, sessionIds: Set<string>): string[] {
  if (value === undefined) return [];
  const errors: string[] = [], obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!obj(value)) return ['La descripción de puesto no es válida.'];
  const text = (v: unknown, max: number, required = false) => typeof v === 'string' && v.length <= max && (!required || !!v.trim());
  if (value.version !== 1 || !['JTQ', 'TQM', 'Ambas'].includes(String(value.company)) || !text(value.role, 180, true) || !text(value.updatedAt, 50, true) || typeof value.archived !== 'boolean' || !/^[a-f0-9]{64}$/.test(String(value.fileHash))) errors.push('Revisa los datos de la descripción de puesto.');
  if (!Array.isArray(value.members) || value.members.length > 100 || value.members.some(v => !text(v, 180, true))) errors.push('Las personas del puesto no son válidas.');
  if (!Array.isArray(value.warnings) || value.warnings.length > 50 || value.warnings.some(v => !text(v, 1000))) errors.push('Los avisos del documento no son válidos.');
  const pageIds = new Set<number>(); let totalText = 0;
  if (!Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > MAX_PDF_PAGES) errors.push('Número de páginas no válido.');
  else for (const p of value.pages) {
    if (!obj(p) || !Number.isInteger(p.number) || Number(p.number) < 1 || Number(p.number) > MAX_PDF_PAGES || pageIds.has(Number(p.number)) || !text(p.text, MAX_DOCUMENT_TEXT) || !['text','ocr'].includes(String(p.method))) errors.push('Página de la descripción no válida.');
    else { pageIds.add(Number(p.number)); totalText += String(p.text).length; }
  }
  if (totalText > MAX_DOCUMENT_TEXT) errors.push('El texto supera el límite de la descripción.');
  const ids = new Set<string>();
  if (!Array.isArray(value.tasks) || value.tasks.length > MAX_JOB_TASKS) errors.push('Demasiadas tareas en el documento.');
  else for (const task of value.tasks) {
    if (!obj(task)) { errors.push('Tarea de puesto no válida.'); continue; }
    if (!text(task.id, 100, true) || ids.has(String(task.id)) || !text(task.title, 300, true) || !text(task.assignee, 180) || !text(task.systems, 1500) || !text(task.notes, 6000) || !text(task.updatedAt, 50, true) || typeof task.excluded !== 'boolean' || !Object.hasOwn(AUTOMATION_LABELS, String(task.automation)) || !['document','added'].includes(String(task.origin))) errors.push('Revisa los datos de una tarea de puesto.');
    ids.add(String(task.id));
    if (task.source !== null && (!obj(task.source) || typeof task.source.page !== 'number' || !pageIds.has(task.source.page) || !text(task.source.quote, 1200, true))) errors.push('La fuente de la tarea no corresponde a una página del PDF.');
    if (task.origin === 'document' && task.source === null) errors.push('Las tareas sugeridas necesitan su fuente.');
    if (task.reviewedIn !== undefined && !sessionIds.has(String(task.reviewedIn))) errors.push('La sesión de revisión de la tarea no existe.');
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 900_000) errors.push('La descripción ocupa demasiado espacio. Divídela en varios documentos.');
  return errors;
}
