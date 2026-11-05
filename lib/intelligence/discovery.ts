import type { AtlasState, DepartmentId, Company } from '../domain';
import { normalize } from '../job-descriptions';
import { recordsOf, stamp, type InterviewData, type SourceRef } from './types';

export function newInterview(company: Company = 'JTQ'): InterviewData {
  return { kind: 'interview', version: 1, updatedAt: stamp(), company, person: '', role: '', task: '', sources: [], turns: [], status: 'draft', automation: 'pending', systems: '', frequency: null, minutes: null, exceptions: '', confirmed: false };
}
export function nextQuestion(interview: InterviewData): string | null {
  const n = interview.turns.length, context = interview.task ? `«${interview.task}»` : 'esta tarea';
  const answered = normalize(interview.turns.map(t => t.answer).join(' '));
  const questions = [
    `¿Cómo realizas ${context}, desde que empieza hasta que termina? Cuéntame un caso reciente.`,
    '¿Qué herramientas utilizas y qué información copias o introduces a mano entre ellas?',
    '¿Cuántas veces realizas esta tarea al mes? Si no lo sabes, indica cómo podríamos comprobarlo.',
    '¿Cuánto tiempo de trabajo activo requiere un caso habitual? Separa el tiempo de espera.',
    /error|excepcion|diferencia|incidencia/.test(answered) ? 'Has mencionado incidencias. ¿Cuál es la más habitual, cómo la detectas y qué haces para resolverla?' : '¿Qué puede salir mal o hacer que un caso necesite un tratamiento diferente?',
    /aprob|responsable|departamento|compra|contab/.test(answered) ? '¿Qué parte depende de otra persona o departamento? ¿Qué le entregas y cuánto esperas?' : '¿Quién recibe el resultado y cómo comprueba que está correcto?',
    '¿Qué parte es manual, cuál está parcialmente automatizada y cuál funciona ya de forma automática?',
    '¿Qué evidencia podemos revisar para confirmar los tiempos y el volumen? ¿Qué cambiarías primero?',
  ];
  return questions[n] ?? null;
}
export interface DiscoveryItem { id: string; departmentId: DepartmentId; company: Company; title: string; systems: string; source: SourceRef; dataKey?: string }
export interface CandidateFinding { key: string; title: string; explanation: string; confidence: 'high' | 'medium'; type: 'duplicate' | 'recapture' | 'ownership'; left: DiscoveryItem; right?: DiscoveryItem }
const stop = new Set('para como los las del una unos unas que con por sus desde hasta entre sobre realizar gestionar proceso tarea datos informacion trabajo'.split(' '));
function tokens(s: string) { return new Set(normalize(s).split(' ').filter(w => w.length > 3 && !stop.has(w)).map(w => w.replace(/(?:ciones|cion)$/, 'cion').replace(/(?:ando|iendo|ados|adas|es|s)$/, ''))); }
export function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b); if (!x.size || !y.size) return 0;
  let shared = 0; for (const word of x) if (y.has(word)) shared++;
  return shared / (x.size + y.size - shared);
}
export function discoverFindings(state: AtlasState): CandidateFinding[] {
  const items: DiscoveryItem[] = [];
  for (const e of state.evidence) if (e.jobDescription && !e.jobDescription.archived && e.departmentId) {
    for (const t of e.jobDescription.tasks) if (!t.excluded) items.push({ id: `${e.id}:${t.id}`, departmentId: e.departmentId, company: e.jobDescription.company, title: t.title, systems: t.systems, source: { id: e.id, title: e.name, quote: t.source?.quote || t.title, page: t.source?.page } });
  }
  for (const e of recordsOf(state.evidence, 'interview')) if (e.intelligence.status === 'reviewed') items.push({ id: e.id, departmentId: e.departmentId, company: e.intelligence.company, title: e.intelligence.task, systems: e.intelligence.systems, source: { id: e.id, title: e.name, quote: e.intelligence.turns[0]?.answer || e.intelligence.task } });
  for (const p of state.processes.filter(p => p.status !== 'discarded')) {
    for (const step of p.operations?.flow ?? []) if (step.capturesData && step.dataKey.trim()) items.push({ id: `${p.id}:${step.id}`, departmentId: step.departmentId, company: p.company, title: step.title, systems: step.system, dataKey: normalize(step.dataKey), source: { id: p.id, title: p.name, quote: `${step.title} · Dato: ${step.dataKey} · Sistema: ${step.system}` } });
  }
  const result: CandidateFinding[] = [], limited = items.slice(0, 1200);
  for (let i = 0; i < limited.length; i++) for (let j = i + 1; j < limited.length; j++) {
    const a = limited[i], b = limited[j];
    if (a.departmentId === b.departmentId || (a.company !== b.company && a.company !== 'Ambas' && b.company !== 'Ambas')) continue;
    const recapture = a.dataKey && a.dataKey === b.dataKey;
    const score = similarity(a.title, b.title);
    if (!recapture && score < .5) continue;
    result.push({ key: [a.id, b.id].sort().join('|'), title: recapture ? `El mismo dato se captura en dos áreas` : `Dos áreas describen trabajo similar`, explanation: recapture ? `Ambos pasos declaran capturar «${a.dataKey}». Comprueba si es una duplicación necesaria o una recaptura evitable.` : `Las descripciones comparten acciones y objetos. Confirma si se trata de la misma actividad, una revisión necesaria o casos diferentes.`, confidence: recapture || score >= .8 ? 'high' : 'medium', type: recapture ? 'recapture' : 'duplicate', left: a, right: b });
  }
  for (const p of state.processes.filter(p => p.status !== 'discarded' && !p.owner.trim())) result.push({ key: `owner:${p.id}`, title: 'Falta un responsable del proceso', explanation: 'La ficha no tiene responsable. Asigna quién valida el proceso y atiende sus excepciones.', confidence: 'high', type: 'ownership', left: { id: p.id, departmentId: p.departmentId, company: p.company, title: p.name, systems: p.systems.join(', '), source: { id: p.id, title: p.name, quote: 'Campo responsable vacío en la ficha del proceso.' } } });
  return result.sort((a,b) => Number(b.confidence === 'high') - Number(a.confidence === 'high')).slice(0, 100);
}
