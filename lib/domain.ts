/** ATLAS domain model. All monetary savings remain estimates until validated measurements exist. */
import { validateOperations, validateBenefits, overlapWarnings, type ProcessOperations, type BenefitConfig } from './operations';
import { validateJobDescription, type JobDescription } from './job-descriptions';
export const COMPANIES = ['JTQ', 'TQM', 'Ambas'] as const;
export type Company = (typeof COMPANIES)[number];
export const DEPARTMENTS = [
  { id: 'contabilidad', name: 'Contabilidad', headcount: null },
  { id: 'finanzas', name: 'Finanzas', headcount: null },
  { id: 'compras', name: 'Compras', headcount: null },
  { id: 'ventas', name: 'Ventas', headcount: 6 },
  { id: 'rrhh', name: 'Departamento de Personas', headcount: null },
  { id: 'marketing', name: 'Marketing', headcount: null },
  { id: 'it', name: 'IT', headcount: null },
  { id: 'direccion', name: 'Dirección', headcount: null },
  { id: 'logistica', name: 'Logística', headcount: null },
  { id: 'tiendas', name: 'Tiendas', headcount: 70 },
] as const;
export type DepartmentId = (typeof DEPARTMENTS)[number]['id'];
export const KNOWN_HEADCOUNTS = { accountingAndFinanceCombined: 6, sales: 6, stores: 70 } as const;
export const IMPACT_DIMENSIONS = [
  { id: 'time', label: 'Tiempo' }, { id: 'cost', label: 'Coste' },
  { id: 'errors', label: 'Errores' }, { id: 'speed', label: 'Velocidad' },
  { id: 'trace', label: 'Trazabilidad' }, { id: 'decisions', label: 'Decisiones' },
  { id: 'sales', label: 'Ventas' }, { id: 'service', label: 'Servicio' },
] as const;
export type ImpactKey = (typeof IMPACT_DIMENSIONS)[number]['id'];
export type Impact = Record<ImpactKey, number>;
export const PROCESS_STATUSES = ['identified', 'assessing', 'approved', 'pilot', 'implemented', 'paused', 'discarded'] as const;
export type ProcessStatus = (typeof PROCESS_STATUSES)[number];
export const STATUS_LABELS: Record<ProcessStatus, string> = { identified: 'Identificado', assessing: 'En análisis', approved: 'Aprobado', pilot: 'En piloto', implemented: 'Implantado', paused: 'Pausado', discarded: 'Descartado' };
export type EvidenceLevel = 'estimate' | 'observed' | 'validated';
export interface Baseline {
  volumePerMonth: number; minutesPerCase: number; peoplePerCase: number; errorRate: number;
  minutesPerError: number; hourlyCost: number; capturedAt: string; source: string; validated: boolean;
}
export interface Process {
  jobTaskSource?: { documentId: string; taskId: string };
  operations?: ProcessOperations; benefits?: BenefitConfig;
  id: string; company: Company; departmentId: DepartmentId; name: string; owner: string;
  description: string; input: string; output: string; currentSteps: string; systems: string[];
  volumePerMonth: number; minutesPerCase: number; peoplePerCase: number; errorRate: number;
  minutesPerError: number; automatablePct: number; adoptionPct: number; exceptionPct: number;
  reviewMinutesPerCase: number; hourlyCost: number; implementationCost: number; monthlyRunningCost: number;
  cashSavingsMonthly: number; cashRealizationPct: number; errorReductionPct: number;
  actualImplementationCost?: number; actualCostSource?: string; implementationCostValidated?: boolean;
  status: ProcessStatus; impact: Impact; complexity: number; risk: number; dataReadiness: number;
  evidenceLevel: EvidenceLevel; notes: string; aiProposal?: string; createdAt: string; updatedAt: string; baseline?: Baseline;
}
export interface Session {
  id: string; company: Company; departmentId: DepartmentId; title: string; date: string; owner: string;
  participants: string[]; notes: string; decisions?: string; nextSteps?: string; status: 'planned' | 'completed'; processIds: string[]; createdAt: string; updatedAt: string;
}
export interface Evidence {
  jobDescription?: JobDescription;
  id: string; processId?: string; sessionId?: string; departmentId?: DepartmentId; anonymized: boolean; name: string; type: 'document' | 'observation' | 'data' | 'interview';
  description: string; source: string; fileName?: string; storagePath?: string; mimeType?: string;
  size?: number; createdAt: string; validated: boolean;
}
export interface Measurement {
  maintenanceCost?: number; aiCost?: number;
  id: string; processId: string; month: string; volume: number; minutesPerCase: number;
  peoplePerCase: number; errors: number; minutesPerError: number; reviewMinutes: number;
  runningCost: number; realCashSaved: number; source: string; validated: boolean; notes: string;
  createdAt: string; updatedAt: string;
}
export interface Settings {
  weights: Impact; currency: 'EUR'; monthlyHoursPerFte: number; aiEnabled: boolean;
  initiativeName: string; organizationName: string;
}
export interface AtlasState {
  schemaVersion: 1; processes: Process[]; sessions: Session[]; evidence: Evidence[];
  measurements: Measurement[]; settings: Settings; updatedAt: string;
}
export interface Metrics {
  baselineHoursMonthly: number; baselineCoreHoursMonthly: number; baselineReworkHoursMonthly: number;
  baselineLaborValueMonthly: number; automatedCasesMonthly: number; grossHoursFreedMonthly: number;
  coreHoursFreedMonthly: number; reworkHoursFreedMonthly: number; reviewHoursMonthly: number;
  netHoursFreedMonthly: number; timeReductionPct: number | null; capacityValueMonthly: number;
  directCashSavingsMonthly: number; realizedCapacityCashMonthly: number; grossCashBenefitMonthly: number;
  monthlyRunningCost: number; netCashBenefitMonthly: number; implementationCost: number;
  firstYearCashNet: number; annualCashRoiPct: number | null; cashPaybackMonths: number | null;
  baselineErrorsMonthly: number; expectedErrorsMonthly: number; assumptions: string[];
}
export interface PriorityDetails {
  score: number; band: 'Alta' | 'Media' | 'Baja'; impactScore: number; feasibilityFactor: number;
  riskFactor: number; dataFactor: number; evidenceFactor: number; warnings: string[];
}
export interface Recommendation {
  source: 'Recomendación por reglas'; title: string; approach: string; rationale: string;
  steps: string[]; prerequisites: string[]; safeguards: string[]; tools: string[]; autonomy: string;
}
export interface AggregateMetrics {
  processCount: number; baselineHoursMonthly: number; netHoursFreedMonthly: number;
  capacityValueMonthly: number; grossCashBenefitMonthly: number; monthlyRunningCost: number;
  netCashBenefitMonthly: number; implementationCost: number; firstYearCashNet: number;
  annualCashRoiPct: number | null; cashPaybackMonths: number | null;
  averagePriority: number; implementedCount: number; validatedMeasurementCount: number;
}
export interface MeasurementComparison {
  kind: 'verified' | 'unverified' | 'missing-baseline'; month: string; baselineHoursAtObservedVolume: number | null;
  observedHours: number; hoursFreed: number | null; timeReductionPct: number | null;
  baselineErrorRate: number | null; observedErrorRate: number | null; realCashSaved: number;
  runningCost: number; netCashSaved: number; source: string; warnings: string[];
}
export type State = AtlasState;
export interface ImportResult { valid: boolean; data?: AtlasState; errors: string[]; warnings: string[] }
export const DEFAULT_SETTINGS: Settings = {
  weights: { time: 30, cost: 22, errors: 16, speed: 10, trace: 8, decisions: 6, sales: 5, service: 3 },
  currency: 'EUR', monthlyHoursPerFte: 160, aiEnabled: false, initiativeName: 'ATLAS', organizationName: 'JTQ · TQM',
};
const now = () => new Date().toISOString();
const newId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); });
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
const nonnegative = (n: number) => Math.max(0, finite(n));
const pct = (n: number) => Math.min(100, nonnegative(n)) / 100;
const level = (n: number) => Math.min(5, Math.max(1, finite(n, 1)));
export function createEmptyState(): AtlasState {
  return { schemaVersion: 1, processes: [], sessions: [], evidence: [], measurements: [], settings: { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights } }, updatedAt: now() };
}
export function createProcess(overrides: Partial<Process> = {}): Process {
  const timestamp = now();
  return {
    id: newId(), company: 'JTQ', departmentId: 'contabilidad', name: '', owner: '', description: '', input: '', output: '',
    currentSteps: '', systems: [], volumePerMonth: 0, minutesPerCase: 0, peoplePerCase: 1, errorRate: 0, minutesPerError: 0,
    automatablePct: 0, adoptionPct: 0, exceptionPct: 0, reviewMinutesPerCase: 0, hourlyCost: 0,
    implementationCost: 0, monthlyRunningCost: 0, cashSavingsMonthly: 0, cashRealizationPct: 0,
    errorReductionPct: 0, status: 'identified', impact: { time: 0, cost: 0, errors: 0, speed: 0, trace: 0, decisions: 0, sales: 0, service: 0 },
    complexity: 3, risk: 3, dataReadiness: 1, evidenceLevel: 'estimate', notes: '', createdAt: timestamp, updatedAt: timestamp,
    ...overrides, ...(overrides.impact ? { impact: Object.assign({ time: 0, cost: 0, errors: 0, speed: 0, trace: 0, decisions: 0, sales: 0, service: 0 }, overrides.impact) } : {}),
  };
}
export function calculateMetrics(p: Process): Metrics {
  const volume = nonnegative(p.volumePerMonth);
  const core = volume * nonnegative(p.minutesPerCase) * nonnegative(p.peoplePerCase) / 60;
  const errors = volume * pct(p.errorRate);
  const rework = errors * nonnegative(p.minutesPerError) / 60;
  const eligibleShare = pct(p.adoptionPct) * (1 - pct(p.exceptionPct));
  const allocation = p.benefits ? pct(p.benefits.allocationPct) : 1;
  const coreFreed = core * pct(p.automatablePct) * eligibleShare * allocation;
  const reworkFreed = rework * pct(p.errorReductionPct) * eligibleShare * allocation;
  // Every adopted case is supervised, including exceptions. Rework is counted once, in its own term.
  const review = volume * pct(p.adoptionPct) * nonnegative(p.reviewMinutesPerCase) / 60 * allocation;
  const netHours = coreFreed + reworkFreed - review;
  const baseline = core + rework;
  const capacity = netHours * nonnegative(p.hourlyCost);
  const realized = capacity * pct(p.cashRealizationPct);
  const direct = nonnegative(p.cashSavingsMonthly) * allocation;
  const grossCash = direct + realized;
  const recurring = nonnegative(p.monthlyRunningCost) + nonnegative(p.benefits?.maintenanceMonthly ?? 0) + nonnegative(p.benefits?.aiMonthly ?? 0);
  const implementation = nonnegative(p.implementationCost);
  const netCash = grossCash - recurring;
  const denominator = implementation + 12 * recurring;
  const assumptions = [
    'Estimación: no constituye un resultado medido ni validado.',
    'La dedicación por caso excluye el retrabajo; este se calcula por separado.',
    'Solo se libera tiempo en los casos adoptados y sin excepción; todos los casos adoptados consumen supervisión.',
    'El valor de la capacidad liberada no equivale a ahorro de caja. Su conversión por defecto es 0 %.',
    'El ahorro directo debe excluir cualquier importe ya incluido en la conversión de capacidad.',
    'El coste de implantación es único; el coste recurrente y los beneficios se consideran constantes durante 12 meses.',
  ];
  if (netHours < 0) assumptions.push('La supervisión prevista supera el tiempo liberado: el saldo de horas es negativo.');
  if (!volume) assumptions.push('Falta el volumen mensual: no puede estimarse la carga de trabajo.');
  if (p.benefits) assumptions.push(`La previsión atribuye el ${p.benefits.allocationPct} % de beneficios y supervisión a este proceso. Los costes se incluyen completos. Mantenimiento e IA se suman al coste operativo base. Las mediciones reales deben registrar importes ya atribuidos.`);
  return {
    baselineHoursMonthly: round(baseline), baselineCoreHoursMonthly: round(core), baselineReworkHoursMonthly: round(rework),
    baselineLaborValueMonthly: round(baseline * nonnegative(p.hourlyCost)), automatedCasesMonthly: round(volume * eligibleShare),
    grossHoursFreedMonthly: round(coreFreed + reworkFreed), coreHoursFreedMonthly: round(coreFreed), reworkHoursFreedMonthly: round(reworkFreed),
    reviewHoursMonthly: round(review), netHoursFreedMonthly: round(netHours), timeReductionPct: baseline > 0 ? round(100 * netHours / baseline) : null,
    capacityValueMonthly: round(capacity), directCashSavingsMonthly: round(direct), realizedCapacityCashMonthly: round(realized),
    grossCashBenefitMonthly: round(grossCash), monthlyRunningCost: round(recurring), netCashBenefitMonthly: round(netCash),
    implementationCost: round(implementation), firstYearCashNet: round(12 * netCash - implementation),
    annualCashRoiPct: denominator > 0 ? round(100 * (12 * grossCash - denominator) / denominator) : null,
    cashPaybackMonths: netCash > 0 ? round(implementation / netCash) : null,
    baselineErrorsMonthly: round(errors), expectedErrorsMonthly: round(errors * (1 - pct(p.errorReductionPct) * eligibleShare)), assumptions,
  };
}
export function priorityDetails(p: Process, settings: Settings = DEFAULT_SETTINGS): PriorityDetails {
  const weightTotal = IMPACT_DIMENSIONS.reduce((sum, d) => sum + nonnegative(settings.weights[d.id]), 0);
  const impactScore = weightTotal > 0 ? IMPACT_DIMENSIONS.reduce((sum, d) => sum + Math.min(5, nonnegative(p.impact[d.id])) / 5 * nonnegative(settings.weights[d.id]), 0) / weightTotal * 100 : 0;
  const feasibilityFactor = 1 - (level(p.complexity) - 1) * 0.1;
  const riskFactor = 1 - (level(p.risk) - 1) * 0.075;
  const dataFactor = 0.6 + (level(p.dataReadiness) - 1) * 0.1;
  const evidenceFactor = p.evidenceLevel === 'validated' ? 1 : p.evidenceLevel === 'observed' ? 0.9 : 0.75;
  const score = round(impactScore * feasibilityFactor * riskFactor * dataFactor * evidenceFactor);
  const warnings: string[] = [];
  if (p.evidenceLevel === 'estimate') warnings.push('Puntuación provisional basada en estimaciones.');
  if (p.dataReadiness <= 2) warnings.push('La preparación de los datos necesita trabajo previo.');
  if (p.risk >= 4) warnings.push('Requiere revisión de riesgo antes de autorizar un piloto.');
  if (p.complexity >= 4) warnings.push('Hay dependencias técnicas que deben verificarse.');
  if (!weightTotal) warnings.push('Los pesos suman cero; no puede priorizarse por impacto.');
  return { score, band: score >= 60 ? 'Alta' : score >= 35 ? 'Media' : 'Baja', impactScore: round(impactScore), feasibilityFactor: round(feasibilityFactor), riskFactor: round(riskFactor), dataFactor: round(dataFactor), evidenceFactor, warnings };
}
export function priorityScore(p: Process, settings: Settings = DEFAULT_SETTINGS): number { return priorityDetails(p, settings).score; }
export function recommendation(p: Process): Recommendation {
  const body = `${p.name} ${p.description} ${p.input} ${p.output} ${p.currentSteps}`.toLowerCase();
  let title = 'Estandarizar y probar una automatización asistida';
  let approach = 'Documentar reglas y entradas, evaluar si hace falta IA y validar un piloto; después, automatizar los casos habituales y derivar las excepciones a una persona.';
  let tools = ['Sistema actual', 'Herramienta de automatización aprobada'];
  if (/factur|albar[aá]n|document|contrat|pdf|ocr/.test(body)) {
    title = 'Captura documental con validación';
    approach = 'Extraer campos y contrastarlos con reglas, importes y datos maestros. Tras validar el piloto y autorizar su alcance, procesar los casos conformes de forma automática y derivar las discrepancias o decisiones sensibles.';
    tools = ['Extracción documental u OCR', 'Validaciones del sistema de destino', 'Revisión humana'];
  } else if (/stock|inventario|pedido|reposici[oó]n|log[ií]st|env[ií]o/.test(body)) {
    title = 'Reglas operativas y alertas de excepción';
    approach = 'Normalizar datos y aplicar reglas verificables para detectar incidencias o proponer acciones; evaluar modelos predictivos cuando exista histórico suficiente.';
    tools = ['ERP o gestión de inventario', 'Reglas y alertas', 'Panel de seguimiento'];
  } else if (/correo|email|consulta|ticket|soporte|incidencia|atenci[oó]n/.test(body)) {
    title = 'Clasificación y borradores asistidos';
    approach = 'Clasificar entradas y localizar información autorizada. Validar las respuestas durante el piloto; después, resolver automáticamente las categorías aprobadas y escalar excepciones o casos sensibles.';
    tools = ['Buzón o sistema de tickets', 'Base de conocimiento autorizada', 'Asistente de IA con revisión'];
  } else if (/informe|report|an[aá]lisis|consolid|cuadro|kpi|concili/.test(body)) {
    title = 'Consolidación de datos y análisis trazable';
    approach = 'Conectar fuentes aprobadas, calcular indicadores con reglas explícitas y generar un resumen vinculado a los datos de origen.';
    tools = ['Fuentes estructuradas', 'Consulta y validación de datos', 'Cuadro de mando y resumen asistido'];
  } else if (/marketing|contenid|campa[ñn]a|publicaci[oó]n|redes/.test(body)) {
    title = 'Producción de borradores con control editorial';
    approach = 'Usar un brief estructurado y referencias aprobadas para generar borradores; revisar información, tono y derechos antes de publicar.';
    tools = ['Brief de campaña', 'Asistente de contenidos', 'Flujo de aprobación'];
  }
  return {
    source: 'Recomendación por reglas', title, approach,
    rationale: 'Orientación heurística basada en el texto registrado. La viabilidad, las integraciones y los costes requieren validación técnica; no se ha consultado un proveedor de IA.',
    steps: ['Validar el proceso actual con su responsable y conservar una línea base.', 'Acordar entradas, salidas, excepciones, límites de actuación y criterios de aceptación.', 'Preparar una muestra representativa y revisar la calidad de los datos.', 'Ejecutar un piloto acotado y observado, midiendo errores y excepciones.', 'Aprobar la ejecución autónoma de los casos habituales que cumplan los criterios; reservar la intervención humana para excepciones y decisiones sensibles.', 'Comparar resultados mensuales con la línea base, ajustar umbrales y disponer de parada y reversión.'],
    prerequisites: [p.dataReadiness <= 2 ? 'Ordenar, depurar y autorizar el acceso a los datos.' : 'Confirmar la representatividad y los permisos de los datos.', 'Verificar acceso e integración con los sistemas citados.', 'Asignar un responsable de validar el piloto y atender las excepciones.'],
    safeguards: ['Mantener revisión humana en decisiones y acciones sensibles.', 'No enviar documentos confidenciales a servicios no autorizados.', 'Registrar errores, excepciones y cambios de criterio.', 'Separar los beneficios previstos de los resultados medidos.'], tools,
    autonomy: 'Piloto observado; después, ejecución autónoma dentro de los límites aprobados, con intervención humana en excepciones y decisiones sensibles, monitorización y posibilidad de detener el flujo.',
  };
}
export function aggregateMetrics(processes: Process[], settings: Settings = DEFAULT_SETTINGS, measurements: Measurement[] = []): AggregateMetrics {
  const eligible = processes.filter(p => p.status !== 'discarded');
  const items = eligible.map(calculateMetrics);
  const sum = (key: keyof Metrics) => round(items.reduce((total, item) => total + (typeof item[key] === 'number' ? item[key] as number : 0), 0));
  const implementationCost = sum('implementationCost');
  const monthlyRunningCost = sum('monthlyRunningCost');
  const grossCashBenefitMonthly = sum('grossCashBenefitMonthly');
  const netCashBenefitMonthly = round(grossCashBenefitMonthly - monthlyRunningCost);
  const denominator = implementationCost + monthlyRunningCost * 12;
  const ids = new Set(eligible.map(p => p.id));
  return {
    processCount: eligible.length, baselineHoursMonthly: sum('baselineHoursMonthly'), netHoursFreedMonthly: sum('netHoursFreedMonthly'),
    capacityValueMonthly: sum('capacityValueMonthly'), grossCashBenefitMonthly, monthlyRunningCost, netCashBenefitMonthly,
    implementationCost, firstYearCashNet: round(12 * netCashBenefitMonthly - implementationCost),
    annualCashRoiPct: denominator > 0 ? round((12 * grossCashBenefitMonthly - denominator) / denominator * 100) : null,
    cashPaybackMonths: netCashBenefitMonthly > 0 ? round(implementationCost / netCashBenefitMonthly) : null,
    averagePriority: eligible.length ? round(eligible.reduce((total, p) => total + priorityScore(p, settings), 0) / eligible.length) : 0,
    implementedCount: eligible.filter(p => p.status === 'implemented').length,
    validatedMeasurementCount: measurements.filter(m => { const p = eligible.find(item => item.id === m.processId); return ids.has(m.processId) && p !== undefined && compareMeasurement(p, m).kind === 'verified'; }).length,
  };
}
export function compareMeasurement(p: Process, m: Measurement): MeasurementComparison {
  const observedHours = (nonnegative(m.volume) * nonnegative(m.minutesPerCase) * nonnegative(m.peoplePerCase) + nonnegative(m.errors) * nonnegative(m.minutesPerError) + nonnegative(m.reviewMinutes)) / 60;
  const baseline = p.baseline;
  const comparableHours = baseline ? (nonnegative(m.volume) * nonnegative(baseline.minutesPerCase) * nonnegative(baseline.peoplePerCase) + nonnegative(m.volume) * pct(baseline.errorRate) * nonnegative(baseline.minutesPerError)) / 60 : null;
  const kind = !baseline ? 'missing-baseline' : baseline.validated && m.validated && m.volume > 0 && comparableHours !== null && comparableHours > 0 && Boolean(m.source.trim()) && Boolean(baseline.source.trim()) ? 'verified' : 'unverified';
  const warnings: string[] = [];
  if (!baseline) warnings.push('No existe una línea base congelada; no se calcula una mejora verificada.');
  else if (!baseline.validated) warnings.push('La línea base no está validada.');
  if (!m.validated || !m.source.trim()) warnings.push('La medición necesita validación y una fuente identificable.');
  if (m.volume <= 0) warnings.push('Sin casos observados no se puede comparar rendimiento por caso.');
  return {
    kind, month: m.month, baselineHoursAtObservedVolume: comparableHours === null ? null : round(comparableHours),
    observedHours: round(observedHours), hoursFreed: comparableHours === null ? null : round(comparableHours - observedHours),
    timeReductionPct: comparableHours && comparableHours > 0 ? round((comparableHours - observedHours) / comparableHours * 100) : null,
    baselineErrorRate: baseline ? baseline.errorRate : null, observedErrorRate: m.volume > 0 ? round(m.errors / m.volume * 100) : null,
    realCashSaved: round(nonnegative(m.realCashSaved)), runningCost: round(nonnegative(m.runningCost) + nonnegative(m.maintenanceCost ?? 0) + nonnegative(m.aiCost ?? 0)),
    netCashSaved: round(nonnegative(m.realCashSaved) - nonnegative(m.runningCost) - nonnegative(m.maintenanceCost ?? 0) - nonnegative(m.aiCost ?? 0)), source: m.source, warnings,
  };
}
export function snapshotBaseline(p: Process, source: string, validated = false): Baseline {
  return { volumePerMonth: p.volumePerMonth, minutesPerCase: p.minutesPerCase, peoplePerCase: p.peoplePerCase, errorRate: p.errorRate, minutesPerError: p.minutesPerError, hourlyCost: p.hourlyCost, capturedAt: now(), source, validated };
}
/** Aggregate actual observations over their recorded months; no annual extrapolation or mean of ROI percentages. */
export function aggregateMeasuredResults(processes: Process[], measurements: Measurement[], verifiedOnly = true) {
  const comparisons = measurements.flatMap(m => {
    const p = processes.find(process => process.id === m.processId);
    if (!p) return [];
    const c = compareMeasurement(p, m);
    if (c.baselineHoursAtObservedVolume === null || m.volume <= 0) return [];
    return verifiedOnly && c.kind !== 'verified' ? [] : [{ process: p, measurement: m, comparison: c }];
  });
  const totalVolume = comparisons.reduce((n, r) => n + r.measurement.volume, 0);
  const baselineHours = comparisons.reduce((n, r) => n + (r.comparison.baselineHoursAtObservedVolume ?? 0), 0);
  const observedHours = comparisons.reduce((n, r) => n + r.comparison.observedHours, 0);
  const errors = comparisons.reduce((n, r) => n + r.measurement.errors, 0);
  const coveredIds = new Set(comparisons.map(r => r.process.id));
  const coveredProcesses = processes.filter(p => coveredIds.has(p.id));
  const actualCostIsVerified = (p: Process) => p.implementationCostValidated === true && typeof p.actualImplementationCost === 'number' && Number.isFinite(p.actualImplementationCost) && p.actualImplementationCost >= 0 && Boolean(p.actualCostSource?.trim());
  const needsCostValidation = coveredProcesses.some(p => !actualCostIsVerified(p));
  const investment = coveredProcesses.reduce((n, p) => n + (actualCostIsVerified(p) ? p.actualImplementationCost! : 0), 0);
  const totalRealCashSaved = comparisons.reduce((n, r) => n + r.measurement.realCashSaved, 0);
  const totalRunningCost = comparisons.reduce((n, r) => n + r.comparison.runningCost, 0);
  const denominator = investment + totalRunningCost;
  const allObservationsVerified = comparisons.length > 0 && comparisons.every(r => r.comparison.kind === 'verified');
  const unresolvedOverlap = overlapWarnings(coveredProcesses).some(g => g.unresolved);
  const canVerifyFinancials = allObservationsVerified && !needsCostValidation && !unresolvedOverlap;
  const observedRoi = canVerifyFinancials && denominator > 0 ? round((totalRealCashSaved - denominator) / denominator * 100) : null;
  const observedMonths = [...new Set(comparisons.map(r => r.measurement.month))].sort();
  const coverageByProcess = coveredProcesses.map(p => ({ processId: p.id, months: comparisons.filter(r => r.process.id === p.id).map(r => r.measurement.month).sort() }));
  const allPeriodsAligned = coverageByProcess.length < 2 || coverageByProcess.every(c => c.months.join(',') === coverageByProcess[0].months.join(','));
  return {
    measurementCount: comparisons.length, processCount: coveredProcesses.length, totalVolume,
    baselineHours: round(baselineHours), observedHours: round(observedHours), hoursFreed: round(baselineHours - observedHours),
    timeReductionPct: baselineHours > 0 ? round((baselineHours - observedHours) / baselineHours * 100) : null,
    observedErrorRate: totalVolume > 0 ? round(errors / totalVolume * 100) : null,
    weightedMinutesPerCase: totalVolume > 0 ? round(comparisons.reduce((n, r) => n + r.measurement.volume * r.measurement.minutesPerCase, 0) / totalVolume) : null,
    totalRealCashSaved: round(totalRealCashSaved), totalRunningCost: round(totalRunningCost),
    netCashSaved: round(totalRealCashSaved - totalRunningCost),
    actualInvestmentCost: canVerifyFinancials ? round(investment) : null,
    knownValidatedInvestmentCost: round(investment),
    cashNetAfterInvestment: canVerifyFinancials ? round(totalRealCashSaved - totalRunningCost - investment) : null,
    cashRoiPct: observedRoi, observedCashRoiPct: observedRoi, needsCostValidation, allObservationsVerified, unresolvedOverlap,
    periodStart: observedMonths[0] ?? null, periodEnd: observedMonths.at(-1) ?? null,
    observedMonths, coverageByProcess, allPeriodsAligned,
    coverageNote: !comparisons.length ? 'Todavía no hay mediciones comparables verificadas.' : allPeriodsAligned ? 'Totales de los meses realmente registrados; no se han anualizado.' : 'Los procesos tienen coberturas mensuales distintas. Los totales solo incluyen los meses registrados de cada proceso; no representan un periodo homogéneo.',
    roiDefinition: '(Ahorro de caja registrado − costes recurrentes registrados − inversión real validada) / (costes recurrentes registrados + inversión real validada) × 100. La inversión de cada proceso se cuenta una sola vez. Si falta una inversión validada o el denominador es cero, el ROI se deja sin calcular.',
  };
}
export function freezeBaseline(p: Process, source = '', validated = false): Baseline { return snapshotBaseline(p, source, validated); }
export function calculateObserved(measurement: Measurement, process: Process): MeasurementComparison { return compareMeasurement(process, measurement); }
export function validateImport(input: unknown): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  if (!isObject(input)) return { valid: false, errors: ['El archivo debe contener un objeto JSON.'], warnings };
  if (input.schemaVersion !== 1) errors.push('Versión de formato no compatible; se requiere schemaVersion: 1.');
  for (const key of ['processes', 'sessions', 'evidence', 'measurements'] as const) if (!Array.isArray(input[key])) errors.push(`Falta la lista ${key}.`);
  if (!isObject(input.settings)) errors.push('Falta la configuración settings.');
  const strings = (obj: Record<string, unknown>, keys: string[], path: string) => keys.forEach(key => { if (typeof obj[key] !== 'string') errors.push(`${path}.${key} debe ser texto.`); });
  const numeric = (obj: Record<string, unknown>, keys: string[], path: string, min = 0, max = Number.MAX_SAFE_INTEGER) => keys.forEach(key => { const v = obj[key]; if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) errors.push(`${path}.${key} debe ser un número entre ${min} y ${max}.`); });
  const bool = (obj: Record<string, unknown>, key: string, path: string) => { if (typeof obj[key] !== 'boolean') errors.push(`${path}.${key} debe ser verdadero o falso.`); };
  const ids = new Set<string>();
  const processIds = new Set<string>();
  const deptIds = new Set<string>(DEPARTMENTS.map(d => d.id));
  const companies = new Set<string>(COMPANIES);
  const inspectRecord = (v: unknown, path: string) => {
    if (!isObject(v)) { errors.push(`${path} debe ser un objeto.`); return null; }
    if (typeof v.id !== 'string' || !v.id.trim()) errors.push(`${path}.id es obligatorio.`);
    else if (ids.has(v.id)) errors.push(`Identificador duplicado: ${v.id}.`);
    else ids.add(v.id);
    return v;
  };
  const dept = (v: Record<string, unknown>, path: string) => {
    if (typeof v.company !== 'string' || !companies.has(v.company)) errors.push(`${path}.company no es válido.`);
    if (typeof v.departmentId !== 'string' || !deptIds.has(v.departmentId)) errors.push(`${path}.departmentId no es válido.`);
  };
  const textArray = (v: Record<string, unknown>, key: string, path: string) => { if (!Array.isArray(v[key]) || !(v[key] as unknown[]).every(x => typeof x === 'string')) errors.push(`${path}.${key} debe ser una lista de textos.`); };
  if (Array.isArray(input.processes)) input.processes.forEach((item, index) => {
    const path = `processes[${index}]`; const p = inspectRecord(item, path); if (!p) return;
    if (typeof p.id === 'string') processIds.add(p.id); dept(p, path);
    strings(p, ['name', 'owner', 'description', 'input', 'output', 'currentSteps', 'notes', 'createdAt', 'updatedAt'], path);
    textArray(p, 'systems', path);
    if (p.aiProposal !== undefined && typeof p.aiProposal !== 'string') errors.push(`${path}.aiProposal debe ser texto.`);
    if (p.actualImplementationCost !== undefined) numeric(p, ['actualImplementationCost'], path);
    if (p.actualCostSource !== undefined && typeof p.actualCostSource !== 'string') errors.push(`${path}.actualCostSource debe ser texto.`);
    if (p.implementationCostValidated !== undefined) bool(p, 'implementationCostValidated', path);
    if (p.implementationCostValidated === true && (typeof p.actualImplementationCost !== 'number' || !Number.isFinite(p.actualImplementationCost) || p.actualImplementationCost < 0 || typeof p.actualCostSource !== 'string' || !p.actualCostSource.trim())) errors.push(`${path}: la inversión real validada necesita un importe explícito y una fuente.`);
    numeric(p, ['volumePerMonth', 'minutesPerCase', 'minutesPerError', 'reviewMinutesPerCase', 'hourlyCost', 'implementationCost', 'monthlyRunningCost', 'cashSavingsMonthly'], path);
    numeric(p, ['peoplePerCase'], path, 1);
    numeric(p, ['errorRate', 'automatablePct', 'adoptionPct', 'exceptionPct', 'cashRealizationPct', 'errorReductionPct'], path, 0, 100);
    numeric(p, ['complexity', 'risk', 'dataReadiness'], path, 1, 5);
    if (!PROCESS_STATUSES.includes(p.status as ProcessStatus)) errors.push(`${path}.status no es válido.`);
    if (!['estimate', 'observed', 'validated'].includes(p.evidenceLevel as string)) errors.push(`${path}.evidenceLevel no es válido.`);
    if (!isObject(p.impact)) errors.push(`${path}.impact no es válido.`); else numeric(p.impact, IMPACT_DIMENSIONS.map(d => d.id), `${path}.impact`, 0, 5);
    if (p.baseline !== undefined) {
      if (!isObject(p.baseline)) errors.push(`${path}.baseline no es válido.`);
      else {
        numeric(p.baseline, ['volumePerMonth', 'minutesPerCase', 'minutesPerError', 'hourlyCost'], `${path}.baseline`);
        numeric(p.baseline, ['peoplePerCase'], `${path}.baseline`, 1);
        numeric(p.baseline, ['errorRate'], `${path}.baseline`, 0, 100);
        strings(p.baseline, ['capturedAt', 'source'], `${path}.baseline`); bool(p.baseline, 'validated', `${path}.baseline`);
        if (p.baseline.validated === true && (typeof p.baseline.source !== 'string' || !p.baseline.source.trim())) errors.push(`${path}.baseline validada necesita una fuente.`);
      }
    }
  });
  if (Array.isArray(input.sessions)) input.sessions.forEach((item, index) => {
    const path = `sessions[${index}]`; const s = inspectRecord(item, path); if (!s) return; dept(s, path);
    strings(s, ['title', 'date', 'owner', 'notes', 'createdAt', 'updatedAt'], path);
    textArray(s, 'participants', path); textArray(s, 'processIds', path);
    for (const key of ['decisions', 'nextSteps']) if (s[key] !== undefined && typeof s[key] !== 'string') errors.push(`${path}.${key} debe ser texto.`);
    if (!['planned', 'completed'].includes(s.status as string)) errors.push(`${path}.status no es válido.`);
    if (Array.isArray(s.processIds)) s.processIds.forEach(id => { if (typeof id !== 'string' || !processIds.has(id)) errors.push(`${path}: referencia a un proceso inexistente.`); });
  });
  const sessionIds = new Set(Array.isArray(input.sessions) ? input.sessions.filter(isObject).map(s => s.id).filter((id): id is string => typeof id === 'string') : []);
  if (Array.isArray(input.evidence)) input.evidence.forEach((item, index) => {
    const path = `evidence[${index}]`; const e = inspectRecord(item, path); if (!e) return;
    strings(e, ['name', 'description', 'source', 'createdAt'], path); bool(e, 'validated', path); bool(e, 'anonymized', path);
    if (!e.processId && !e.sessionId && !e.departmentId) errors.push(`${path}: vincula la evidencia a un proceso, una sesión o un departamento.`);
    if (e.processId !== undefined && !processIds.has(e.processId as string)) errors.push(`${path}: proceso inexistente.`);
    if (e.sessionId !== undefined && !sessionIds.has(e.sessionId as string)) errors.push(`${path}: sesión inexistente.`);
    if (e.departmentId !== undefined && !deptIds.has(e.departmentId as string)) errors.push(`${path}: departamento inexistente.`);
    if (!['document', 'observation', 'data', 'interview'].includes(e.type as string)) errors.push(`${path}.type no es válido.`);
    for (const key of ['fileName', 'storagePath', 'mimeType']) if (e[key] !== undefined && typeof e[key] !== 'string') errors.push(`${path}.${key} debe ser texto.`);
    if (e.size !== undefined) numeric(e, ['size'], path);
    errors.push(...validateJobDescription(e.jobDescription, sessionIds));
    if (e.jobDescription !== undefined && (!e.departmentId || e.type !== 'document' || e.mimeType !== 'application/pdf')) errors.push('Una descripción de puesto necesita departamento y archivo PDF.');
  });
  const jobSources = new Set<string>();
  if (Array.isArray(input.processes)) for (const p of input.processes) if (isObject(p) && p.jobTaskSource !== undefined) {
    const source = p.jobTaskSource;
    if (!isObject(source) || typeof source.documentId !== 'string' || typeof source.taskId !== 'string') { errors.push('El origen de la oportunidad no es válido.'); continue; }
    const e = Array.isArray(input.evidence) && input.evidence.find(e => isObject(e) && e.id === source.documentId);
    const job = isObject(e) && isObject(e.jobDescription) ? e.jobDescription : null;
    if (!job || !Array.isArray(job.tasks) || !job.tasks.some(t => isObject(t) && t.id === source.taskId)) errors.push('La tarea de origen de la oportunidad no existe.');
    const key = `${source.documentId}:${source.taskId}`;
    if (jobSources.has(key)) errors.push('Una tarea de puesto ya tiene una oportunidad vinculada.');
    jobSources.add(key);
  }
  const periodKeys = new Set<string>();
  if (Array.isArray(input.measurements)) input.measurements.forEach((item, index) => {
    const path = `measurements[${index}]`; const m = inspectRecord(item, path); if (!m) return;
    strings(m, ['processId', 'month', 'source', 'notes', 'createdAt', 'updatedAt'], path); bool(m, 'validated', path);
    if (!processIds.has(m.processId as string)) errors.push(`${path}: proceso inexistente.`);
    if (typeof m.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month)) errors.push(`${path}.month debe tener formato AAAA-MM.`);
    const periodKey = `${m.processId}:${m.month}`; if (periodKeys.has(periodKey)) errors.push(`${path}: ya existe una medición de ese proceso en ese mes.`); else periodKeys.add(periodKey);
    numeric(m, ['volume', 'minutesPerCase', 'errors', 'minutesPerError', 'reviewMinutes', 'runningCost', 'realCashSaved'], path);
    numeric(m, ['peoplePerCase'], path, 1);
    if (!Number.isInteger(m.volume) || !Number.isInteger(m.errors)) errors.push(`${path}: el volumen y los casos con error deben ser enteros.`);
    if (typeof m.errors === 'number' && typeof m.volume === 'number' && m.errors > m.volume) errors.push(`${path}.errors no puede superar los casos observados.`);
    if (m.validated === true && (typeof m.source !== 'string' || !m.source.trim())) errors.push(`${path}: una medición validada necesita una fuente.`);
  });
  if (isObject(input.settings)) {
    const s = input.settings;
    if (s.currency !== 'EUR') errors.push('La moneda de configuración debe ser EUR.');
    if (!isObject(s.weights)) errors.push('Los pesos de prioridad no son válidos.'); else numeric(s.weights, IMPACT_DIMENSIONS.map(d => d.id), 'settings.weights', 0, 100);
    numeric(s, ['monthlyHoursPerFte'], 'settings', 1, 744); bool(s, 'aiEnabled', 'settings'); strings(s, ['initiativeName', 'organizationName'], 'settings');
    if (isObject(s.weights) && IMPACT_DIMENSIONS.every(d => typeof s.weights === 'object' && s.weights !== null && (s.weights as Record<string, unknown>)[d.id] === 0)) warnings.push('Todos los pesos están a cero. La prioridad resultante será cero.');
  }
  if (typeof input.updatedAt !== 'string') errors.push('Falta updatedAt.');
  if (Array.isArray(input.processes)) for (const p of input.processes) if (isObject(p)) {
    errors.push(...validateOperations(p.operations, String(p.id), processIds, deptIds), ...validateBenefits(p.benefits));
    const ops = p.operations as ProcessOperations | undefined;
    if (ops?.playbook?.published && Array.isArray(input.measurements)) {
      const source = input.measurements.find(m => isObject(m) && m.id === ops.playbook!.sourceMeasurementId && m.processId === p.id);
      if (!source || !isObject(source) || source.validated !== true || !isObject(p.baseline) || p.baseline.validated !== true || !source.source || !p.baseline.source || !(Number(source.volume) > 0)) errors.push('Una plantilla publicada necesita una medición comparable validada del proceso de origen.');
      else if (!errors.length && compareMeasurement(p as unknown as Process, source as unknown as Measurement).kind !== 'verified') errors.push('La medición de origen debe ser comparable con una línea base positiva.');
    }
  }
  if (Array.isArray(input.measurements)) for (const m of input.measurements) if (isObject(m)) for (const key of ['maintenanceCost', 'aiCost']) if (m[key] !== undefined) numeric(m, [key], 'measurement');
  if (errors.length) return { valid: false, errors: errors.slice(0, 100), warnings };
  return { valid: true, data: structuredClone(input) as unknown as AtlasState, errors, warnings };
}
