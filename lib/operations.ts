import { calculateMetrics, compareMeasurement, type Process, type Measurement, type DepartmentId } from './domain';

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';
export interface FlowStep { id: string; title: string; departmentId: DepartmentId; system: string; minutes: number; waitMinutes: number; dataKey: string; capturesData: boolean }
export interface ProcessLink { id: string; targetId: string; label: string }
export interface DeliveryTask { id: string; title: string; owner: string; dueDate: string; status: TaskStatus; dependsOn: string[]; budget: number; acceptance: string; evidence: string; approval: 'pending' | 'approved' | 'rejected'; approver: string; approvedAt: string }
export interface Discussion { id: string; author: string; text: string; at: string }
export interface ActivityEntry { id: string; author: string; text: string; at: string }
export interface AutomationRun { id: string; externalId: string; at: string; status: 'success' | 'error' | 'partial'; cases: number; errors: number; durationSeconds: number; cost: number; pendingExceptions: number; detail: string; source: 'manual' | 'import' | 'webhook'; resolvedAt: string; resolution: string }
export interface Automation { id: string; name: string; provider: string; owner: string; active: boolean; expectedEveryHours: number; errorThresholdPct: number; monthlyBudget: number; runs: AutomationRun[] }
export interface RolloutObservation { month: string; volume: number; adoptedCases: number; baselineMinutes: number; observedMinutes: number; errors: number; source: string; validated: boolean; notes: string; templateVersion: number; cohort: string }
export interface Rollout extends RolloutObservation { id: string; store: string; owner: string; status: 'planned' | 'pilot' | 'adopted' | 'paused'; completedSteps: string[]; history?: RolloutObservation[] }
export interface PlaybookVersion { title: string; version: number; instructions: string; prerequisites: string; sourceMeasurementId: string; publishedAt: string }
export interface Playbook extends PlaybookVersion { published: boolean; rollouts: Rollout[]; versions?: PlaybookVersion[] }
export interface ProcessOperations { flow: FlowStep[]; links: ProcessLink[]; tasks: DeliveryTask[]; comments: Discussion[]; activity: ActivityEntry[]; automations: Automation[]; playbook?: Playbook }
export interface BenefitConfig { maintenanceMonthly: number; aiMonthly: number; overlapKey: string; allocationPct: number; source: string; conservativePct: number; optimisticPct: number }

export const uid = () => crypto.randomUUID();
export const timestamp = () => new Date().toISOString();
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const emptyOperations = (): ProcessOperations => ({ flow: [], links: [], tasks: [], comments: [], activity: [], automations: [] });
export const operationsOf = (p: Process): ProcessOperations => p.operations ?? emptyOperations();
export const benefitsOf = (p: Process): BenefitConfig => p.benefits ?? { maintenanceMonthly: 0, aiMonthly: 0, overlapKey: '', allocationPct: 100, source: '', conservativePct: 75, optimisticPct: 115 };
export const taskLabels: Record<TaskStatus, string> = { todo: 'Pendiente', doing: 'En curso', blocked: 'Bloqueada', done: 'Completada' };
export const runLabels = { success: 'Correcta', error: 'Fallida', partial: 'Parcial' };
export const rolloutLabels = { planned: 'Planificada', pilot: 'En piloto', adopted: 'Adoptada', paused: 'Pausada' };
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function newTask(): DeliveryTask { return { id: uid(), title: '', owner: '', dueDate: '', status: 'todo', dependsOn: [], budget: 0, acceptance: '', evidence: '', approval: 'pending', approver: '', approvedAt: '' }; }
export function newAutomation(): Automation { return { id: uid(), name: '', provider: 'Otro', owner: '', active: true, expectedEveryHours: 24, errorThresholdPct: 5, monthlyBudget: 0, runs: [] }; }
export function newRun(): AutomationRun { return { id: uid(), externalId: '', at: timestamp(), status: 'success', cases: 0, errors: 0, durationSeconds: 0, cost: 0, pendingExceptions: 0, detail: '', source: 'manual', resolvedAt: '', resolution: '' }; }
export function newRollout(store = ''): Rollout { return { id: uid(), store, cohort: '', owner: '', status: 'planned', completedSteps: [], month: today().slice(0, 7), volume: 0, adoptedCases: 0, baselineMinutes: 0, observedMinutes: 0, errors: 0, source: '', validated: false, notes: '', templateVersion: 1 }; }

export function taskBlockers(task: DeliveryTask, tasks: DeliveryTask[]) { return task.dependsOn.filter(id => tasks.find(t => t.id === id)?.status !== 'done'); }
export function taskCycle(tasks: DeliveryTask[]): boolean {
  const visited = new Set<string>(), active = new Set<string>();
  const walk = (id: string): boolean => { if (active.has(id)) return true; if (visited.has(id)) return false; active.add(id); if ((tasks.find(t => t.id === id)?.dependsOn ?? []).some(walk)) return true; active.delete(id); visited.add(id); return false; };
  return tasks.some(t => walk(t.id));
}
export function flowInsights(flow: FlowStep[]) {
  const captured = new Set<string>(), duplicateIds = new Set<string>();
  for (const s of flow) { const key = s.dataKey.trim().toLocaleLowerCase(); if (s.capturesData && key) { if (captured.has(key)) duplicateIds.add(s.id); captured.add(key); } }
  return { activeMinutes: round(flow.reduce((n, s) => n + s.minutes, 0)), waitMinutes: round(flow.reduce((n, s) => n + s.waitMinutes, 0)), handoffs: flow.filter((s, i) => i > 0 && flow[i - 1].departmentId !== s.departmentId).length, duplicateIds };
}
export function automationHealth(a: Automation, now = Date.now()) {
  const runs = [...a.runs].sort((x, y) => Date.parse(y.at) - Date.parse(x.at)); const last = runs[0];
  const recent = runs.filter(r => Date.parse(r.at) >= now - 30 * 86400000 && Date.parse(r.at) <= now);
  const cases = recent.reduce((n, r) => n + r.cases, 0), errors = recent.reduce((n, r) => n + r.errors, 0);
  const failedRuns = recent.filter(r => r.status !== 'success').length;
  const errorPct = cases ? errors / cases * 100 : recent.length ? failedRuns / recent.length * 100 : null;
  const month = today().slice(0, 7);
  const monthCost = runs.filter(r => new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit' }).format(new Date(r.at)) === month).reduce((n, r) => n + r.cost, 0);
  const pending = runs.filter(r => !r.resolvedAt).reduce((n, r) => n + r.pendingExceptions, 0);
  const alerts: string[] = [];
  if (a.active) {
    if (!last) alerts.push('Sin ejecuciones recibidas');
    else if (a.expectedEveryHours > 0 && now - Date.parse(last.at) > a.expectedEveryHours * 3600000) alerts.push('Ejecución esperada sin recibir');
    if (last?.status === 'error') alerts.push('Última ejecución fallida');
    if (errorPct !== null && errorPct > a.errorThresholdPct) alerts.push('Errores por encima del umbral');
    if (pending) alerts.push(`${pending} excepciones pendientes`);
    if (a.monthlyBudget > 0 && monthCost > a.monthlyBudget) alerts.push('Presupuesto mensual superado');
  }
  return { last, recent, cases, errorPct, monthCost: round(monthCost), pending, alerts, status: !a.active ? 'Seguimiento pausado' : !last ? 'Sin datos' : alerts.length ? 'Requiere atención' : 'En orden' };
}
export function mergeRuns(existing: AutomationRun[], incoming: AutomationRun[]) {
  const ids = new Set(existing.map(r => r.externalId || r.id)), result = [...existing]; let added = 0;
  for (const raw of incoming) { const errors = validateRun(raw); if (errors.length) throw new Error(errors.join(' ')); const run = { ...raw, externalId: raw.externalId.trim(), at: new Date(raw.at).toISOString() }; const key = run.externalId || run.id; if (!ids.has(key)) { ids.add(key); result.push(run); added++; } }
  if (result.length > 1000) throw new Error('El historial admite 1.000 ejecuciones. Exporta la copia y crea otro registro de automatización para continuar.');
  return { runs: result.sort((a, b) => b.at.localeCompare(a.at)), added };
}
export function parseRuns(text: string): AutomationRun[] {
  const value: unknown = JSON.parse(text); const list = Array.isArray(value) ? value : [value];
  if (!list.length || list.length > 1000) throw new Error('Importa entre 1 y 1.000 ejecuciones.');
  return list.map((raw: any) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Cada ejecución debe ser un objeto.');
    const run: AutomationRun = { ...newRun(), ...raw, id: uid(), source: 'import', resolvedAt: '', resolution: '' };
    if (typeof run.externalId !== 'string' || !run.externalId.trim()) throw new Error('Cada ejecución necesita externalId para evitar duplicados.');
    const errors = validateRun(run); if (errors.length) throw new Error(errors.join(' '));
    return run;
  });
}
export function benefitScenarios(p: Process) {
  const config = benefitsOf(p);
  return [{ key: 'conservative', label: 'Conservador', factor: config.conservativePct }, { key: 'expected', label: 'Esperado', factor: 100 }, { key: 'optimistic', label: 'Optimista', factor: config.optimisticPct }].map(s => {
    const factor = s.factor / 100;
    // Only adoption and direct cash are varied; volume, baseline and costs stay fixed.
    const adjusted = { ...p, adoptionPct: Math.min(100, p.adoptionPct * factor), cashSavingsMonthly: p.cashSavingsMonthly * factor };
    return { ...s, metrics: calculateMetrics(adjusted) };
  });
}
export function overlapWarnings(processes: Process[]) {
  const groups = new Map<string, Process[]>();
  for (const p of processes.filter(p => p.status !== 'discarded')) { const key = benefitsOf(p).overlapKey.trim().toLocaleLowerCase(); if (key) groups.set(key, [...(groups.get(key) ?? []), p]); }
  return [...groups].filter(([, items]) => items.length > 1).map(([key, items]) => ({ key, items, allocation: items.reduce((n, p) => n + benefitsOf(p).allocationPct, 0), unresolved: items.reduce((n, p) => n + benefitsOf(p).allocationPct, 0) > 100 }));
}
export function publishable(p: Process, measurements: Measurement[], measurementId: string) {
  const m = measurements.find(x => x.id === measurementId && x.processId === p.id);
  return p.status === 'implemented' && Boolean(m && compareMeasurement(p, m).kind === 'verified');
}
export function rolloutMetrics(r: Rollout) {
  const comparable = r.validated && Boolean(r.source.trim()) && r.volume > 0;
  return { comparable, adoptionPct: r.volume ? round(r.adoptedCases / r.volume * 100) : null, hoursPer100: comparable ? round((r.baselineMinutes - r.observedMinutes) * 100 / 60) : null, hoursFreed: comparable ? round((r.baselineMinutes - r.observedMinutes) * r.volume / 60) : null, errorPct: comparable ? round(r.errors / r.volume * 100) : null };
}
export function recordRollout(previous: Rollout | undefined, next: Rollout): Rollout {
  const history = (previous?.history ?? []).filter(m => m.month !== next.month);
  if (previous && previous.month !== next.month) {
    const { month, volume, adoptedCases, baselineMinutes, observedMinutes, errors, source, validated, notes, templateVersion, cohort } = previous;
    const snapshot = { month, volume, adoptedCases, baselineMinutes, observedMinutes, errors, source, validated, notes, templateVersion, cohort };
    return { ...next, history: [...history.filter(m=>m.month!==previous.month), snapshot] };
  }
  return { ...next, history };
}
export function rolloutObservations(r: Rollout): Rollout[] { return [...(r.history ?? []).filter(m=>m.month!==r.month).map(m=>({...r,...m})), r]; }
export function rolloutRequirements(book: Playbook, rollout: Rollout) { const version = rollout.templateVersion === book.version ? book : book.versions?.find(v => v.version === rollout.templateVersion); return (version?.prerequisites ?? '').split('\n').map(s=>s.trim()).filter(Boolean); }
export function revisePlaybook(previous: Playbook | undefined, next: Playbook): Playbook {
  const changed = previous?.published && ['title','instructions','prerequisites','sourceMeasurementId'].some(k => previous[k as keyof Playbook] !== next[k as keyof Playbook]);
  if (!changed || !previous) return next;
  const { title, version, instructions, prerequisites, sourceMeasurementId, publishedAt } = previous;
  return { ...next, version: version + 1, versions: [...(previous.versions ?? []), { title, version, instructions, prerequisites, sourceMeasurementId, publishedAt }] };
}

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const hasText = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
function textFields(v: Record<string, any>, names: string[], errors: string[], path: string) { for (const k of names) if (typeof v[k] !== 'string' || v[k].length > 12000) errors.push(`${path}.${k}: texto no válido (máximo 12.000 caracteres).`); }
function numbers(v: Record<string, any>, names: string[], errors: string[], path: string, max = 1e12) { for (const k of names) if (typeof v[k] !== 'number' || !Number.isFinite(v[k]) || v[k] < 0 || v[k] > max) errors.push(`${path}.${k}: número fuera de rango.`); }
function bool(v: Record<string, any>, k: string, errors: string[], path: string) { if (typeof v[k] !== 'boolean') errors.push(`${path}.${k}: valor no válido.`); }
export function validateRun(r: unknown): string[] {
  const e: string[] = []; if (!object(r)) return ['Ejecución no válida.'];
  textFields(r, ['id', 'externalId', 'at', 'detail', 'resolvedAt', 'resolution'], e, 'Ejecución'); numbers(r, ['cases', 'errors', 'durationSeconds', 'cost', 'pendingExceptions'], e, 'Ejecución');
  if (!Number.isFinite(Date.parse(r.at)) || Date.parse(r.at) > Date.now() + 300000) e.push('La ejecución necesita una fecha válida que no esté en el futuro.');
  if (!['success', 'error', 'partial'].includes(r.status) || !['manual', 'import', 'webhook'].includes(r.source)) e.push('Estado u origen de ejecución no válido.');
  if (![r.cases, r.errors, r.pendingExceptions].every(Number.isInteger) || r.errors > r.cases || r.pendingExceptions > r.cases) e.push('Los casos, errores y excepciones deben ser enteros coherentes.');
  if (r.resolvedAt && (!Number.isFinite(Date.parse(r.resolvedAt)) || !hasText(r.resolution))) e.push('Documenta la resolución de las excepciones.');
  return e;
}
export function validateOperations(value: unknown, processId: string, processIds: Set<string>, departmentIds: Set<string>): string[] {
  const e: string[] = []; if (value === undefined) return e; if (!object(value)) return ['Operaciones no válidas.'];
  const collection = (key: string, max: number): Record<string, any>[] => { const list = value[key]; if (!Array.isArray(list) || list.length > max || list.some(x => !object(x))) { e.push(`Operaciones.${key}: lista no válida (máximo ${max}).`); return []; } const ids = new Set<string>(); for (const item of list) { if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) e.push(`Operaciones.${key}: identificador vacío o repetido.`); ids.add(item.id); } return list; };
  const flow = collection('flow', 100), links = collection('links', 100), tasks = collection('tasks', 200), comments = collection('comments', 500), activity = collection('activity', 500), automations = collection('automations', 20);
  for (const s of flow) { textFields(s, ['id', 'title', 'system', 'dataKey'], e, 'Paso'); numbers(s, ['minutes', 'waitMinutes'], e, 'Paso'); bool(s, 'capturesData', e, 'Paso'); if (!departmentIds.has(s.departmentId) || !hasText(s.title)) e.push('Cada paso necesita nombre y departamento.'); }
  for (const l of links) { textFields(l, ['id', 'targetId', 'label'], e, 'Relación'); if (!processIds.has(l.targetId) || l.targetId === processId) e.push('La relación debe apuntar a otro proceso existente.'); }
  const taskIds = new Set(tasks.map(t => t.id));
  for (const t of tasks) {
    textFields(t, ['id', 'title', 'owner', 'dueDate', 'acceptance', 'evidence', 'approver', 'approvedAt'], e, 'Tarea'); numbers(t, ['budget'], e, 'Tarea');
    if (!hasText(t.title) || !['todo','doing','blocked','done'].includes(t.status) || !['pending','approved','rejected'].includes(t.approval)) e.push('Nombre o estado de tarea no válido.');
    if (!Array.isArray(t.dependsOn) || t.dependsOn.some((id: any) => id === t.id || !taskIds.has(id))) e.push('Dependencia de tarea no válida.');
    if (t.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) || !Number.isFinite(Date.parse(t.dueDate)))) e.push('Fecha de tarea no válida.');
    if (t.approval === 'approved' && (!hasText(t.approver) || !hasText(t.evidence) || !hasText(t.acceptance) || !Number.isFinite(Date.parse(t.approvedAt)))) e.push('Una aprobación necesita responsable, criterio, evidencia y fecha.');
    if (t.status === 'done' && (t.approval !== 'approved' || (Array.isArray(t.dependsOn) && taskBlockers(t as DeliveryTask, tasks as DeliveryTask[]).length))) e.push('Para completar una tarea, apruébala y resuelve sus dependencias.');
  }
  if (tasks.every(t => Array.isArray(t.dependsOn)) && taskCycle(tasks as DeliveryTask[])) e.push('Las dependencias de tareas forman un ciclo.');
  for (const c of [...comments, ...activity]) { textFields(c, ['id', 'author', 'text', 'at'], e, 'Actividad'); if (!Number.isFinite(Date.parse(c.at))) e.push('Fecha de actividad no válida.'); }
  for (const a of automations) {
    textFields(a, ['id', 'name', 'provider', 'owner'], e, 'Automatización'); bool(a, 'active', e, 'Automatización'); numbers(a, ['expectedEveryHours', 'monthlyBudget'], e, 'Automatización'); numbers(a, ['errorThresholdPct'], e, 'Automatización', 100);
    if (!hasText(a.name) || !Array.isArray(a.runs) || a.runs.length > 1000) { e.push('Automatización sin nombre o historial no válido.'); continue; }
    const runKeys = new Set<string>(); for (const r of a.runs) { e.push(...validateRun(r)); if (object(r)) { const key = r.externalId || r.id; if (runKeys.has(key)) e.push('Ejecución duplicada.'); runKeys.add(key); } }
  }
  if (value.playbook !== undefined) {
    const b = value.playbook; if (!object(b)) return [...e, 'Plantilla no válida.'];
    textFields(b, ['title', 'instructions', 'prerequisites', 'sourceMeasurementId', 'publishedAt'], e, 'Plantilla'); bool(b, 'published', e, 'Plantilla'); if (!Number.isInteger(b.version) || b.version < 1) e.push('Versión de plantilla no válida.');
    if (b.published && (!hasText(b.title) || !hasText(b.instructions) || !hasText(b.prerequisites) || !hasText(b.sourceMeasurementId))) e.push('Completa instrucciones, requisitos y medición antes de publicar.');
    if (b.versions !== undefined) {
      if (!Array.isArray(b.versions) || b.versions.length > 100) e.push('Historial de versiones no válido (máximo 100).');
      else { const versions = new Set<number>(); for (const v of b.versions) { if (!object(v)) {e.push('Versión de procedimiento no válida.');continue;} textFields(v,['title','instructions','prerequisites','sourceMeasurementId','publishedAt'],e,'Versión'); if(!Number.isInteger(v.version)||v.version<1||v.version>=b.version||versions.has(v.version))e.push('Número de versión de procedimiento no válido.');versions.add(v.version); } }
    }
    if (!Array.isArray(b.rollouts) || b.rollouts.length > 250) return [...e, 'Lista de despliegues no válida.'];
    const stores = new Set<string>(), rolloutIds = new Set<string>();
    for (const r of b.rollouts) {
      if (!object(r)) { e.push('Despliegue no válido.'); continue; }
      textFields(r, ['id', 'store', 'cohort', 'owner', 'month', 'source', 'notes'], e, 'Tienda'); numbers(r, ['volume', 'adoptedCases', 'baselineMinutes', 'observedMinutes', 'errors'], e, 'Tienda'); bool(r, 'validated', e, 'Tienda');
      if (typeof r.store === 'string') { const key = r.store.trim().toLocaleLowerCase(); if (!key || stores.has(key)) e.push('Cada tienda debe tener un nombre único en esta plantilla.'); stores.add(key); }
      if (!r.id || rolloutIds.has(r.id)) e.push('Identificador de despliegue vacío o repetido.'); rolloutIds.add(r.id);
      if (!['planned','pilot','adopted','paused'].includes(r.status) || !Number.isInteger(r.templateVersion) || r.templateVersion < 1 || r.templateVersion > b.version) e.push('Estado o versión de despliegue no válido.');
      if (!Array.isArray(r.completedSteps) || r.completedSteps.some((s: any) => typeof s !== 'string')) e.push('Comprobaciones de tienda no válidas.');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) || ![r.volume,r.adoptedCases,r.errors].every(Number.isInteger) || r.adoptedCases > r.volume || r.errors > r.volume) e.push('Periodo o casos de tienda no válidos.');
      if (r.validated && (!hasText(r.source) || r.volume <= 0)) e.push('Una medición de tienda validada necesita casos y fuente.');
      if (r.status === 'adopted' && (!r.validated || !hasText(r.owner) || !b.published)) e.push('Para adoptar una mejora, publica la plantilla, asigna responsable y valida la medición.');
      if (r.status === 'adopted' && Array.isArray(r.completedSteps) && typeof b.prerequisites === 'string' && (b.versions === undefined || Array.isArray(b.versions))) {
        if (r.templateVersion !== b.version && !b.versions?.some((v: any) => object(v) && v.version === r.templateVersion)) e.push('No se conserva el procedimiento de la versión adoptada.');
        else if (rolloutRequirements(b as Playbook, r as Rollout).some(s=>!r.completedSteps.includes(s))) e.push('Completa los requisitos de la versión adoptada.');
      }
      if (r.history !== undefined) {
        if (!Array.isArray(r.history) || r.history.length > 120) e.push('Historial de tienda no válido (máximo 120 meses).');
        else { const months = new Set<string>(); for (const h of r.history) { if (!object(h)) {e.push('Observación histórica no válida.');continue;} textFields(h,['month','source','notes','cohort'],e,'Historial');numbers(h,['volume','adoptedCases','baselineMinutes','observedMinutes','errors'],e,'Historial');bool(h,'validated',e,'Historial');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(h.month)||months.has(h.month)||h.month===r.month||![h.volume,h.adoptedCases,h.errors].every(Number.isInteger)||h.adoptedCases>h.volume||h.errors>h.volume||!Number.isInteger(h.templateVersion)||h.templateVersion<1) e.push('Periodo o casos históricos no válidos.');if(h.validated&&(!hasText(h.source)||h.volume<=0))e.push('Una observación histórica validada necesita casos y fuente.');months.add(h.month); } }
      }
    }
  }
  return e;
}
export function validateBenefits(value: unknown) {
  const e: string[] = []; if (value === undefined) return e; if (!object(value)) return ['Configuración de beneficios no válida.'];
  textFields(value, ['overlapKey', 'source'], e, 'Beneficio'); numbers(value, ['maintenanceMonthly','aiMonthly'], e, 'Beneficio'); numbers(value, ['allocationPct','conservativePct'], e, 'Beneficio',100); numbers(value, ['optimisticPct'],e,'Beneficio',200);
  if (value.optimisticPct < 100) e.push('El escenario optimista debe ser al menos el 100 % del esperado.');
  if (value.allocationPct !== 100 && (!hasText(value.overlapKey) || !hasText(value.source))) e.push('Documenta el grupo y la fuente del reparto de beneficios.');
  return e;
}
