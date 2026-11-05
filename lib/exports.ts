'use client';

import { DEPARTMENTS, STATUS_LABELS, IMPACT_DIMENSIONS, calculateMetrics, aggregateMetrics, compareMeasurement, priorityDetails, recommendation, type AtlasState, type Process } from './domain';
import { overlapWarnings, operationsOf, taskLabels, automationHealth, rolloutLabels } from './operations';
import type PptxGenJS from 'pptxgenjs';

let presentationLibrary: Promise<typeof PptxGenJS> | null = null;
function loadPresentationLibrary(): Promise<typeof PptxGenJS> {
  if (presentationLibrary) return presentationLibrary;
  presentationLibrary = new Promise((resolve, reject) => {
    const browser = window as typeof window & { PptxGenJS?: typeof PptxGenJS };
    if (browser.PptxGenJS) { resolve(browser.PptxGenJS); return; }
    const script = document.createElement('script');
    script.src = '/vendor/pptxgen.bundle.js';
    script.onload = () => browser.PptxGenJS ? resolve(browser.PptxGenJS) : reject(new Error('No se pudo iniciar el generador de presentaciones.'));
    script.onerror = () => { presentationLibrary = null; reject(new Error('No se pudo cargar el generador de presentaciones. Reintenta con conexión.')); };
    document.head.appendChild(script);
  });
  return presentationLibrary;
}

const money = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const number = (n: number | null, suffix = '') => n === null ? 'Pendiente de datos' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n) + suffix;
const date = () => new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'Atlantic/Canary' }).format(new Date());
const departmentName = (id: string) => DEPARTMENTS.find(d => d.id === id)?.name || id;
const download = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
function scope(state: AtlasState, dept?: string) {
  const processes = dept ? state.processes.filter(p => p.departmentId === dept) : state.processes;
  const ids = new Set(processes.map(p => p.id));
  const measurements = state.measurements.filter(m => ids.has(m.processId));
  const sessions = dept ? state.sessions.filter(s => s.departmentId === dept) : state.sessions;
  return { processes, measurements, sessions, label: dept ? departmentName(dept) : 'Informe global', metrics: aggregateMetrics(processes, state.settings, measurements) };
}
function observed(state: AtlasState, processes: Process[]) {
  const rows = state.measurements.flatMap(m => { const p = processes.find(x => x.id === m.processId); if (!p) return []; const c = compareMeasurement(p, m); return c.kind === 'verified' ? [{ p, m, c }] : []; });
  const unique = [...new Map(rows.map(r => [r.p.id, r.p])).values()];
  const completeCosts = !overlapWarnings(unique).some(g => g.unresolved) && unique.length > 0 && unique.every(p => p.actualImplementationCost !== undefined && p.implementationCostValidated && Boolean(p.actualCostSource?.trim()));
  const initialCost = unique.reduce((sum, p) => sum + (p.actualImplementationCost || 0), 0);
  const runningCost = rows.reduce((sum, r) => sum + r.c.runningCost, 0);
  const grossCash = rows.reduce((sum, r) => sum + r.m.realCashSaved, 0);
  const denominator = initialCost + runningCost;
  return { rows, hours: rows.reduce((sum, r) => sum + (r.c.hoursFreed || 0), 0), cashNet: grossCash - runningCost, completeCosts, initialCost, runningCost, netAfterInvestment: completeCosts ? grossCash - denominator : null, roi: completeCosts && denominator > 0 ? (grossCash - denominator) / denominator * 100 : null };
}

export async function downloadReport(state: AtlasState, departmentId?: string) {
  const { jsPDF } = await import('jspdf'); const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const sc = scope(state, departmentId); const measured = observed(state, sc.processes); const demo = state.settings.initiativeName.includes('Demostración');
  const ink: [number, number, number] = [23, 23, 25]; const gray: [number, number, number] = [105, 108, 117]; const blue: [number, number, number] = [50, 101, 240];
  let y = 30; let page = 1;
  const header = () => { pdf.setFillColor(245, 245, 247); pdf.rect(0, 0, 210, 297, 'F'); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...ink); pdf.text('ATLAS', 20, 15); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...gray); pdf.text(demo ? 'DEMOSTRACIÓN · Datos ficticios' : 'Automatización y mejora operativa', 40, 15); pdf.setFontSize(8); pdf.text('JTQ + TQM  /  ' + String(page).padStart(2, '0'), 190, 284, { align: 'right' }); };
  const newPage = () => { pdf.addPage(); page++; y = 30; header(); };
  const room = (h: number) => { if (y + h > 270) newPage(); };
  const label = (text: string) => { room(12); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...blue); pdf.text(text.toUpperCase(), 20, y); y += 8; };
  const title = (text: string, size = 25) => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(size); const lines = pdf.splitTextToSize(text, 166); room(lines.length * size * 0.45 + 8); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(size); pdf.setTextColor(...ink); pdf.text(lines, 20, y); y += lines.length * size * 0.45 + 7; };
  const para = (text: string, size = 10) => { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size); pdf.setTextColor(...gray); const lines = pdf.splitTextToSize(text || 'Pendiente de documentar.', 166); for (const line of lines) { room(5); pdf.setFontSize(size); pdf.setTextColor(...gray); pdf.text(line, 20, y); y += 5; } y += 3; };
  const row = (left: string, right: string) => { room(13); pdf.setDrawColor(223, 224, 229); pdf.line(20, y + 6, 190, y + 6); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...gray); pdf.text(left, 20, y); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...ink); pdf.text(right, 190, y, { align: 'right' }); y += 12; };
  header(); label(demo ? 'Ejemplo ficticio' : 'Estado del programa'); title(sc.label, 32); para(date());
  para(sc.processes.length ? `Este informe reúne ${sc.processes.length} procesos registrados, ${sc.sessions.length} sesiones y ${sc.measurements.length} mediciones mensuales. Los resultados previstos y los observados se presentan por separado.` : 'El diagnóstico está preparado para comenzar. Aún no hay procesos, mediciones ni beneficios registrados. Las cifras de ahorro y ROI se completarán con información de las entrevistas y pruebas.');
  y += 6; row('Procesos registrados', String(sc.processes.length)); row('Sesiones completadas', String(sc.sessions.filter(s => s.status === 'completed').length)); row('Automatizaciones implantadas', String(sc.metrics.implementedCount)); row('Mediciones comparables verificadas', String(measured.rows.length));
  label('Escenario previsto');
  row('Capacidad que se prevé liberar', sc.processes.length ? number(sc.metrics.netHoursFreedMonthly, ' h/mes') : 'Pendiente');
  row('Valor de esa capacidad', sc.processes.length ? money(sc.metrics.capacityValueMonthly) + '/mes' : 'Pendiente');
  row('Beneficio neto de caja previsto', sc.processes.length ? money(sc.metrics.netCashBenefitMonthly) + '/mes' : 'Pendiente');
  row('ROI de caja previsto a 12 meses', number(sc.metrics.annualCashRoiPct, ' %'));
  para('El valor de las horas liberadas expresa capacidad disponible. Solo se convierte en ahorro de caja cuando existe una reducción de gasto documentada. El escenario previsto presupone doce meses de beneficios y costes recurrentes constantes, sin extrapolar resultados como si estuvieran demostrados.', 9);
  newPage(); label('Resultados observados'); title('Qué podemos demostrar');
  if (!measured.rows.length) para('Todavía no existen comparaciones verificadas. Hace falta una línea base validada, una medición posterior con casos observados y una fuente identificable.');
  else {
    row('Horas liberadas en periodos verificados', number(measured.hours, ' h'));
    row('Caja neta antes de inversión inicial', money(measured.cashNet));
    row('Inversión inicial real documentada', measured.completeCosts ? money(measured.initialCost) : 'Pendiente de validar');
    row('Resultado después de inversión', measured.netAfterInvestment === null ? 'Pendiente de validar' : money(measured.netAfterInvestment));
    row('ROI observado en los periodos cubiertos', number(measured.roi, ' %'));
    para('Las horas se comparan con la línea base al volumen observado. La caja recoge los importes declarados y validados para los meses incluidos. El ROI observado necesita además la inversión real validada de cada proceso; no representa una proyección anual.');
  }
  label('Cobertura por departamento');
  for (const d of DEPARTMENTS.filter(d => !departmentId || d.id === departmentId)) {
    const ps = sc.processes.filter(p => p.departmentId === d.id); const completed = sc.sessions.filter(s => s.departmentId === d.id && s.status === 'completed').length;
    row(d.name, `${ps.length} procesos / ${completed} sesiones`);
  }
  newPage(); label('Orden de trabajo propuesto'); title('Prioridades explicadas');
  para('Los pesos reflejan los objetivos declarados. La puntuación incorpora impacto, complejidad, riesgo, preparación de los datos y calidad de la evidencia. Es una recomendación revisable, pendiente de aprobación.');
  para(IMPACT_DIMENSIONS.map(d => `${d.label}: ${state.settings.weights[d.id]} %`).join('  ·  '));
  const sorted = [...sc.processes].filter(p => p.status !== 'discarded').sort((a, b) => priorityDetails(b, state.settings).score - priorityDetails(a, state.settings).score);
  if (!sorted.length) para('La clasificación aparecerá cuando se registren y valoren los primeros procesos.');
  for (let i = 0; i < sorted.length; i++) { const p = sorted[i]; const score = priorityDetails(p, state.settings); room(30); title(`${i + 1}. ${p.name}`, 14); para(`${departmentName(p.departmentId)} / ${p.company} / ${STATUS_LABELS[p.status]} / ${number(score.score)} sobre 100. ${score.warnings.join(' ')}`, 9); }
  label('Capacidad de implantación'); para('Propuesta de trabajo: mantener un piloto activo cada vez. Preparar el siguiente mientras se mide el actual. Ampliar la autonomía cuando las pruebas y el registro de excepciones lo justifiquen.');
  for (const p of sc.processes) {
    const m = calculateMetrics(p); const rec = recommendation(p); const pMeasures = sc.measurements.filter(x => x.processId === p.id).sort((a, b) => a.month.localeCompare(b.month));
    newPage(); label(`${departmentName(p.departmentId)} / ${p.company}`); title(p.name); para(`Responsable: ${p.owner || 'Pendiente de asignar'}. Estado: ${STATUS_LABELS[p.status]}. Evidencia: ${p.evidenceLevel === 'validated' ? 'validada' : p.evidenceLevel === 'observed' ? 'observada' : 'estimada'}.`);
    label('Situación inicial'); para(p.description); para(`Entrada: ${p.input || 'Pendiente'}. Salida: ${p.output || 'Pendiente'}. Sistemas: ${p.systems.join(', ') || 'Pendiente'}.`); para(p.currentSteps);
    row('Volumen y dedicación actuales', `${number(p.volumePerMonth)} casos/mes · ${number(p.minutesPerCase)} min/caso`);
    row('Carga mensual estimada con retrabajo', number(m.baselineHoursMonthly, ' h'));
    row('Capacidad neta que se prevé liberar', number(m.netHoursFreedMonthly, ' h/mes'));
    row('Caja neta mensual prevista', money(m.netCashBenefitMonthly));
    row('Inversión prevista y coste mensual', `${money(p.implementationCost)} + ${money(calculateMetrics(p).monthlyRunningCost)}/mes`);
    row('ROI de caja previsto a 12 meses', number(m.annualCashRoiPct, ' %'));
    label('Cómo abordar la mejora'); para(rec.title); para(rec.approach); rec.steps.forEach((step, i) => para(`${i + 1}. ${step}`, 9)); para(rec.rationale, 8);
    if (p.aiProposal) { label('Propuesta guardada'); para(p.aiProposal); }
    label('Línea base'); para(p.baseline ? `${p.baseline.validated ? 'Validada' : 'Pendiente de validar'}, capturada el ${p.baseline.capturedAt.slice(0, 10)}. Fuente: ${p.baseline.source}. Los datos se conservarán para comparar a igual volumen.` : 'Todavía no se ha congelado una línea base. Debe completarse antes de ejecutar el piloto.');
    label('Después observado');
    if (!pMeasures.length) para('Pendiente de mediciones posteriores a la implantación.');
    for (const measurement of pMeasures) {
      const c = compareMeasurement(p, measurement); room(36); title(`${measurement.month} · ${c.kind === 'verified' ? 'Verificado' : 'Pendiente de verificación'}`, 13);
      para(`${measurement.volume} casos. Horas observadas: ${number(c.observedHours)}. Horas liberadas al mismo volumen: ${number(c.hoursFreed)}. Caja neta mensual: ${money(c.netCashSaved)}. Fuente: ${measurement.source || 'Pendiente'}. ${c.warnings.join(' ')}`, 9);
    }
    if (p.notes) { label('Notas del diagnóstico'); para(p.notes); }
    const ops = operationsOf(p);
    if (ops.flow.length) { label('Mapa del proceso'); ops.flow.forEach((s,i)=>para(`${i+1}. ${s.title} · ${departmentName(s.departmentId)} · ${s.system || 'Sin sistema'}. Actividad: ${number(s.minutes)} min/caso; espera posterior: ${number(s.waitMinutes)} min/caso.`,9)); }
    if (ops.tasks.length) { label('Plan de implantación'); ops.tasks.forEach(t=>{ para(`${t.title}. ${taskLabels[t.status]}. Responsable: ${t.owner || 'Pendiente'}. Fecha límite: ${t.dueDate || 'Sin fecha'}. Presupuesto: ${money(t.budget)}.`,9); if(t.approval==='approved')para(`Aceptación: ${t.acceptance}. Evidencia: ${t.evidence}. Registrada por ${t.approver} el ${t.approvedAt.slice(0,10)}.`,9); }); }
    if (ops.automations.length) { label('Seguimiento de automatizaciones'); ops.automations.forEach(a=>{const h=automationHealth(a);para(`${a.name} · ${a.provider}. ${h.status}. ${number(h.cases)} casos en los últimos 30 días. ${h.pending} excepciones pendientes. Coste registrado este mes: ${money(h.monthCost)}.`,9);}); }
    if (ops.playbook) { label('Mejora replicable'); para(`${ops.playbook.title}. Versión ${ops.playbook.version}. ${ops.playbook.published?'Publicada':'Borrador'}.`);para(ops.playbook.instructions,9);ops.playbook.rollouts.forEach(r=>para(`${r.store}: ${rolloutLabels[r.status]}. Responsable: ${r.owner||'Pendiente'}. Versión ${r.templateVersion}.`,9)); }
    const ev = state.evidence.filter(e => e.processId === p.id); if (ev.length) { label('Referencias de evidencia'); ev.forEach(e => para(`${e.name}. ${e.source}. ${e.validated ? 'Validada' : 'Revisión pendiente'}.`, 9)); }
  }
  newPage(); label('Trazabilidad del informe'); title('Criterios y fuentes');
  para(`Fuente interna: registros introducidos por el equipo en ${state.settings.initiativeName}. Exportación: ${date()}. Alcance: ${sc.label}. ${demo ? 'Este documento utiliza exclusivamente datos ficticios de demostración.' : 'No se han añadido resultados que no estén registrados en la aplicación.'}`);
  para('Prioridad = impacto ponderado × factor de complejidad × factor de riesgo × preparación de datos × calidad de evidencia. Los factores son una metodología propuesta del programa, ajustable mediante los pesos.');
  para('Carga mensual = casos × minutos activos × personas concurrentes / 60, más retrabajo. El tiempo activo por caso debe excluir el retrabajo ya contabilizado y las esperas sin dedicación humana.');
  para('Capacidad liberada = reducción prevista de tiempo y retrabajo en casos adoptados sin excepción, menos supervisión. Caja neta = ahorro directo más capacidad efectivamente convertida en gasto evitado, menos coste operativo.');
  para('ROI previsto de caja a 12 meses = (beneficios de caja de 12 meses − inversión − costes operativos de 12 meses) / (inversión + costes operativos de 12 meses). Sin costes en el denominador el ROI se muestra pendiente, no infinito.');
  para('ROI observado = (ahorros de caja verificados − costes recurrentes reales − inversión real validada) / (costes recurrentes reales + inversión real validada), para los periodos incluidos. Una fuente declarada y una validación interna deben respaldarse con evidencia conservada.');
  para('Los campos de anonimización registran la revisión del usuario. La aplicación no transforma por sí sola imágenes, voces, documentos ni metadatos.');
  for(const group of overlapWarnings(sc.processes)) para(`Beneficio compartido ${group.key}: ${number(group.allocation)} % atribuido entre ${group.items.map(p=>p.name).join(', ')}. ${group.unresolved?'El reparto supera el 100 % y necesita revisión.':'Verificar que las mediciones reales registran solo el importe atribuible a cada proceso.'}`,9);
  pdf.save(`ATLAS_${slug(sc.label)}_${new Date().toISOString().slice(0, 10)}${demo ? '_DEMO' : ''}.pdf`);
}

export async function downloadPresentation(state: AtlasState, departmentId?: string) {
  const PptxConstructor = await loadPresentationLibrary(); const pptx = new PptxConstructor(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'ATLAS · Oficina de automatización'; pptx.subject = 'Comité de Dirección'; pptx.title = 'Estado del programa de automatización'; pptx.company = 'JTQ + TQM';
  const sc = scope(state, departmentId); const ob = observed(state, sc.processes); const demo = state.settings.initiativeName.includes('Demostración');
  const C = { bg: 'F5F5F7', ink: '171719', gray: '6B6D76', blue: '3265F0', line: 'DEDFE5' }; let i = 0;
  const slide = (heading: string, kicker: string) => { const s = pptx.addSlide(); s.background = { color: C.bg }; i++; s.addText('ATLAS', { x: .6, y: .3, w: 1.5, h: .25, fontFace: 'Aptos', fontSize: 12, bold: true, color: C.ink, margin: 0 }); s.addText(demo ? 'DEMOSTRACIÓN · DATOS FICTICIOS' : 'JTQ + TQM', { x: 8.8, y: .3, w: 3.9, h: .25, align: 'right', fontSize: 10, color: C.gray, margin: 0 }); s.addText(kicker.toUpperCase(), { x: .6, y: 1, w: 12, h: .3, fontSize: 10, bold: true, charSpacing: 2, color: C.blue, margin: 0 }); s.addText(heading, { x: .6, y: 1.5, w: 12, h: 1.05, fontSize: 34, fontFace: 'Aptos Display', bold: true, color: C.ink, margin: 0, breakLine: false, fit: 'shrink' }); s.addText(date(), { x: .6, y: 7.05, w: 8, h: .2, fontSize: 9, color: C.gray, margin: 0 }); s.addText(String(i).padStart(2, '0'), { x: 12, y: 7.05, w: .7, h: .2, align: 'right', fontSize: 9, color: C.gray, margin: 0 }); return s; };
  const body = (s: ReturnType<typeof slide>, text: string, y = 3, size = 22) => s.addText(text, { x: .65, y, w: 11.8, h: 3.5, fontSize: size, color: C.gray, fontFace: 'Aptos', margin: 0, breakLine: false, fit: 'shrink', valign: 'top', paraSpaceAfter: 14 });
  const metric = (s: ReturnType<typeof slide>, x: number, value: string, label: string) => { s.addText(value, { x, y: 3.1, w: 3.6, h: 1.1, fontSize: 43, color: C.ink, fontFace: 'Aptos Display', bold: true, margin: 0, fit: 'shrink' }); s.addText(label, { x, y: 4.4, w: 3.4, h: .9, fontSize: 15, color: C.gray, margin: 0, valign: 'top' }); };
  let s = slide('Estado del programa\nde automatización', sc.label); body(s, 'Liberar tiempo. Reducir costes. Disminuir errores.\nDiagnóstico, propuestas y resultados con fuentes.', 3.5, 24);
  s = slide('Cobertura del diagnóstico', 'Situación actual'); metric(s, .7, String(sc.processes.length), 'Procesos registrados'); metric(s, 4.8, String(sc.sessions.filter(x => x.status === 'completed').length), 'Sesiones completadas'); metric(s, 8.9, String(sc.metrics.implementedCount), 'Automatizaciones implantadas');
  s = slide('Las oportunidades se ordenan por impacto', 'Criterio de prioridad'); body(s, IMPACT_DIMENSIONS.map(d => `${d.label}  ${state.settings.weights[d.id]} %`).join('\n'), 2.9, 20); s.addText('La puntuación se ajusta por complejidad, riesgo, datos y evidencia. Dirección valida las decisiones.', { x: 6.1, y: 3.4, w: 6, h: 1.8, fontSize: 24, color: C.ink, margin: 0 });
  s = slide('Prioridades propuestas', 'Hoja de ruta'); const ranked = [...sc.processes].filter(p => p.status !== 'discarded').sort((a, b) => priorityDetails(b, state.settings).score - priorityDetails(a, state.settings).score).slice(0, 5); body(s, ranked.length ? ranked.map((p, idx) => `${idx + 1}. ${p.name}\n${departmentName(p.departmentId)} · ${number(priorityDetails(p, state.settings).score)}/100 · ${STATUS_LABELS[p.status]}`).join('\n\n') : 'Pendiente de las primeras entrevistas y valoraciones.\nEl diagnóstico comienza con registros vacíos.', 2.9, 20);
  s = slide('El escenario previsto es una estimación', 'Beneficio esperado'); metric(s, .7, sc.processes.length ? number(sc.metrics.netHoursFreedMonthly, ' h') : '—', 'Capacidad neta liberada al mes'); metric(s, 4.8, sc.processes.length ? money(sc.metrics.netCashBenefitMonthly) : '—', 'Caja neta prevista al mes'); metric(s, 8.9, sc.metrics.annualCashRoiPct === null ? 'Pendiente' : number(sc.metrics.annualCashRoiPct, ' %'), 'ROI de caja previsto a 12 meses'); s.addText('El valor de las horas liberadas no se contabiliza automáticamente como ahorro económico.', { x: .7, y: 6.1, w: 11.8, h: .5, fontSize: 13, color: C.gray, margin: 0 });
  s = slide('Los resultados se contrastan con la línea base', 'Después observado'); metric(s, .7, ob.rows.length ? number(ob.hours, ' h') : 'Pendiente', 'Horas liberadas en periodos verificados'); metric(s, 4.8, ob.rows.length ? money(ob.cashNet) : 'Pendiente', 'Caja neta antes de inversión inicial'); metric(s, 8.9, ob.roi === null ? 'Pendiente' : number(ob.roi, ' %'), 'ROI observado con costes reales validados'); s.addText('Se compara al volumen observado. Sin fuente, línea base y costes reales validados, el ROI queda pendiente.', { x: .7, y: 6.1, w: 11.8, h: .6, fontSize: 13, color: C.gray, margin: 0 });
  s = slide('Un piloto activo cada vez', 'Capacidad de ejecución'); body(s, 'Responsable de coordinación e implantación: Miguel Ángel.\nPatrocinio y decisiones de prioridad: Dirección.\nValidación operativa: responsable del departamento.\nRevisión de resultados: mensual.\nAmpliación de autonomía: según pruebas y excepciones.', 3, 22);
  s = slide('Decisiones para el comité', 'Siguiente revisión'); body(s, ranked.length ? 'Validar la información y las fuentes de las oportunidades priorizadas.\nSeleccionar el primer piloto y su responsable operativo.\nAprobar recursos y criterios de aceptación.\nAcordar cuándo revisar los resultados observados.' : 'Confirmar la disponibilidad de responsables y ejecutores.\nCompletar las primeras entrevistas y sus evidencias.\nRevisar la clasificación cuando haya datos suficientes.\nSeleccionar el primer piloto después de validar su línea base.', 3, 22);
  for (const p of ranked.slice(0, 3)) { s = slide(p.name, `${departmentName(p.departmentId)} / Propuesta`); const r = recommendation(p); body(s, `${p.description || 'Descripción pendiente.'}\n\n${r.approach}\n\nPróximo paso: validar muestra, dependencias y criterios de aceptación.`, 3, 20); s.addNotes(`Orientación por reglas, no resultado de una consulta IA. ${r.rationale}`); }
  s = slide('Fuentes y límites de la comparación', 'Trazabilidad'); body(s, `Fuente: registros de ATLAS exportados el ${date()}.\nLas cifras previstas proceden de los supuestos registrados.\nLas observadas requieren fuentes y validación interna.\nEl ROI observado incluye inversión real y costes de los meses medidos.\n${demo ? 'Todos los ejemplos de esta presentación son ficticios.' : 'El documento no presupone beneficios de procesos todavía sin medir.'}`, 3, 20);
  await pptx.writeFile({ fileName: `ATLAS_Comite_${slug(sc.label)}_${new Date().toISOString().slice(0, 10)}${demo ? '_DEMO' : ''}.pptx` });
}

export function downloadCSV(state: AtlasState, departmentId?: string) {
  const sc = scope(state, departmentId);
  const rows: (string | number | null)[][] = [['Empresa', 'Departamento', 'Proceso', 'Responsable', 'Estado', 'Prioridad estimada', 'Horas actuales mes', 'Horas previstas liberadas mes', 'Valor capacidad EUR mes', 'Caja neta prevista EUR mes', 'Inversion prevista EUR', 'Coste recurrente EUR mes', 'ROI previsto 12 meses %', 'Evidencia', 'ID']];
  for (const p of sc.processes) { const m = calculateMetrics(p); rows.push([p.company, departmentName(p.departmentId), p.name, p.owner, STATUS_LABELS[p.status], priorityDetails(p, state.settings).score, m.baselineHoursMonthly, m.netHoursFreedMonthly, m.capacityValueMonthly, m.netCashBenefitMonthly, m.implementationCost, m.monthlyRunningCost, m.annualCashRoiPct, p.evidenceLevel, p.id]); }
  // Prefix formula-like text so a descriptive field cannot become an Excel formula.
  const escape = (value: string | number | null) => { let text = value === null ? '' : String(value); if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
  download(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `ATLAS_${slug(sc.label)}.csv`);
}
