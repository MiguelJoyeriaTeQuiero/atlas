import { parseCSV } from '../measurement-import';
import type { ProcessEvent } from './types';

export interface EventMapping { caseId: string; activity: string; at: string; eventId: string; resource: string; activeMinutes: string; cost: string }
export const emptyMapping = (): EventMapping => ({ caseId: '', activity: '', at: '', eventId: '', resource: '', activeMinutes: '', cost: '' });
export function inspectEventCSV(text: string) {
  if (new TextEncoder().encode(text).byteLength > 5 * 1024 * 1024) throw new Error('El archivo supera 5 MB. Divide la exportación.');
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Incluye una cabecera y al menos un evento.');
  if (rows.length > 5001) throw new Error('La vista previa admite hasta 5.000 filas.');
  const headers = rows[0].map(v => v.trim());
  if (headers.some(v => !v) || new Set(headers).size !== headers.length) throw new Error('Cada columna necesita un nombre diferente y no vacío.');
  return { headers, rows: rows.slice(1) };
}
export function importEvents(text: string, mapping: EventMapping): { events: ProcessEvent[]; duplicates: number } {
  const { headers, rows } = inspectEventCSV(text);
  for (const name of ['caseId','activity','at'] as const) if (!headers.includes(mapping[name])) throw new Error('Asocia las columnas de caso, actividad y fecha.');
  const mandatory = [mapping.caseId, mapping.activity, mapping.at];
  if (new Set(mandatory).size !== 3) throw new Error('Caso, actividad y fecha deben ser columnas distintas.');
  if (Object.values(mapping).some(column => column && !headers.includes(column))) throw new Error('Una columna asociada ya no existe. Revisa el mapeo del archivo.');
  const events: ProcessEvent[] = [], seen = new Map<string, string>(); let duplicates = 0;
  for (const [index,row] of rows.entries()) {
    const line = index + 2;
    if (row.length !== headers.length) throw new Error(`Fila ${line}: el número de columnas no coincide con la cabecera.`);
    const get = (key: keyof EventMapping) => mapping[key] ? row[headers.indexOf(mapping[key])]?.trim() ?? '' : '';
    const caseId = get('caseId'), activity = get('activity'), rawDate = get('at');
    if (!caseId || !activity || caseId.length > 200 || activity.length > 200) throw new Error(`Fila ${line}: caso y actividad son obligatorios, con un máximo de 200 caracteres.`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(rawDate) || !Number.isFinite(Date.parse(rawDate))) throw new Error(`Fila ${line}: utiliza fecha ISO con zona horaria, por ejemplo 2026-11-05T09:30:00Z.`);
    const [year, month, day] = rawDate.slice(0, 10).split('-').map(Number);
    const calendar = new Date(0); calendar.setUTCFullYear(year, month - 1, day);
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || Number(rawDate.slice(11, 13)) > 23) throw new Error(`Fila ${line}: la fecha no existe en el calendario.`);
    const num = (key: 'activeMinutes' | 'cost') => { const s = get(key); if (!s) return null; if (!/^\d+(?:[.,]\d+)?$/.test(s)) throw new Error(`Fila ${line}: ${key} debe ser positivo o cero, sin separador de miles.`); const n = Number(s.replace(',','.')); if (n > (key === 'activeMinutes' ? 100000 : 1e9)) throw new Error(`Fila ${line}: ${key} supera el límite admitido.`); return n; };
    const data = { caseId, activity, at: new Date(rawDate).toISOString(), resource: get('resource'), activeMinutes: num('activeMinutes'), cost: num('cost') };
    const signature = JSON.stringify(data), eventId = get('eventId') || signature;
    if (seen.has(eventId)) { if (seen.get(eventId) !== signature) throw new Error(`Fila ${line}: el identificador del evento ya existe con datos diferentes.`); duplicates++; continue; }
    if (get('eventId').length > 250 || data.resource.length > 200) throw new Error(`Fila ${line}: identificador o recurso demasiado largo.`);
    seen.set(eventId, signature); events.push({ id: get('eventId') || `row-${line}`, ...data });
  }
  if (events.length > 3000) throw new Error('Guarda hasta 3.000 eventos por registro. Divide el archivo para continuar.');
  return { events, duplicates };
}
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((a,b) => a-b), m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
export function mineEvents(events: ProcessEvent[], terminalActivity = '') {
  const cases = new Map<string, ProcessEvent[]>();
  for (const event of events) { const list = cases.get(event.caseId) ?? []; list.push(event); cases.set(event.caseId,list); }
  const variants = new Map<string, { activities: string[]; cases: number; minutes: number[] }>();
  const edges = new Map<string, { from: string; to: string; count: number; minutes: number[] }>();
  const activities = new Map<string, { name: string; count: number; activeMinutes: number; activeSamples: number; cost: number; costSamples: number }>();
  const durations: number[] = []; let completed = 0, reworked = 0, ties = 0;
  for (const [caseId, list] of cases) {
    list.sort((a,b) => Date.parse(a.at)-Date.parse(b.at) || a.id.localeCompare(b.id));
    const sequence = list.map(e => e.activity), signature = JSON.stringify(sequence);
    const duration = (Date.parse(list.at(-1)!.at) - Date.parse(list[0].at))/60000;
    const isComplete = !!terminalActivity && sequence.at(-1) === terminalActivity;
    if (isComplete) completed++;
    if (!terminalActivity || isComplete) durations.push(duration);
    if (new Set(sequence).size < sequence.length) reworked++;
    const variant = variants.get(signature) ?? { activities: sequence, cases: 0, minutes: [] }; variant.cases++; variant.minutes.push(duration); variants.set(signature, variant);
    for (const [i,event] of list.entries()) {
      const activity = activities.get(event.activity) ?? { name: event.activity, count: 0, activeMinutes: 0, activeSamples: 0, cost: 0, costSamples: 0 };
      activity.count++; if (event.activeMinutes !== null) { activity.activeMinutes += event.activeMinutes; activity.activeSamples++; } if (event.cost !== null) { activity.cost += event.cost; activity.costSamples++; } activities.set(event.activity,activity);
      if (i) { const previous = list[i-1], minutes = (Date.parse(event.at)-Date.parse(previous.at))/60000; if (!minutes) ties++; const key = JSON.stringify([previous.activity,event.activity]); const edge = edges.get(key) ?? { from: previous.activity, to: event.activity, count: 0, minutes: [] }; edge.count++; edge.minutes.push(minutes); edges.set(key,edge); }
    }
  }
  return { caseCount: cases.size, completed, open: terminalActivity ? cases.size-completed : null, reworked, ties, medianMinutes: median(durations), p90Minutes: durations.length ? [...durations].sort((a,b)=>a-b)[Math.max(0,Math.ceil(durations.length*.9)-1)] : null, variants: [...variants.values()].map(v=>({...v,medianMinutes:median(v.minutes)})).sort((a,b)=>b.cases-a.cases), edges: [...edges.values()].map(e=>({...e,medianMinutes:median(e.minutes)})).sort((a,b)=>(b.medianMinutes??0)-(a.medianMinutes??0)), activities: [...activities.values()].sort((a,b)=>b.count-a.count) };
}
export const EVENT_EXAMPLE = 'caso,actividad,fecha,recurso,minutos_activos,coste\nPED-001,Recibir,2026-11-02T09:00:00Z,Ventas,4,0\nPED-001,Revisar,2026-11-02T10:00:00Z,Compras,8,0\nPED-001,Completar,2026-11-02T11:00:00Z,Compras,2,0\nPED-002,Recibir,2026-11-02T09:15:00Z,Ventas,3,0\nPED-002,Revisar,2026-11-02T12:00:00Z,Compras,10,0\nPED-002,Revisar,2026-11-02T14:00:00Z,Compras,6,0\nPED-002,Completar,2026-11-03T09:00:00Z,Compras,2,0';
