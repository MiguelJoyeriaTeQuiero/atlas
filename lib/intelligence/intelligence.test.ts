import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, createProcess, validateImport } from '../domain';
import { emptyOperations } from '../operations';
import { newInterview, discoverFindings, nextQuestion } from './discovery';
import { emptyMapping, EVENT_EXAMPLE, importEvents, mineEvents } from './mining';
import { blueprintTasks, createBlueprint, n8nDraft, newScenario, simulate } from './planning';
import { knowledgeSources, publishKnowledge } from './knowledge';
import { studioRecord, type KnowledgeData } from './types';
import { validateIntelligence } from './validation';

const mapping = { ...emptyMapping(), caseId:'caso', activity:'actividad', at:'fecha', resource:'recurso', activeMinutes:'minutos_activos', cost:'coste' };
const knowledge = (): KnowledgeData => ({ kind:'knowledge',version:1,updatedAt:new Date().toISOString(),company:'JTQ',owner:'Responsable de prueba',status:'draft',content:'Antes de registrar una factura se comprueba el número, el importe y el proveedor.',sources:[{id:'manual',title:'Procedimiento revisado',quote:'Verificación de facturas.'}],versions:[],reviewDate:'' });

test('Event mining separates elapsed time, active work and repeated cases', () => {
  const {events,duplicates}=importEvents(EVENT_EXAMPLE,mapping), result=mineEvents(events,'Completar');
  assert.equal(duplicates,0); assert.equal(result.caseCount,2); assert.equal(result.completed,2);
  assert.equal(result.reworked,1); assert.equal(result.variants.length,2);
  assert.equal(result.medianMinutes,772.5); assert.equal(result.p90Minutes,1425);
  assert.equal(result.activities.reduce((n,a)=>n+a.activeMinutes,0),35);
  const incomplete=mineEvents(events.filter(e=>!(e.caseId==='PED-002'&&e.activity==='Completar')),'Completar');
  assert.equal(incomplete.open,1); assert.equal(incomplete.medianMinutes,120);
});

test('Import tolerates exact duplicate events but rejects ambiguous identities', () => {
  const header='id,caso,actividad,fecha\n', row='one,A,Recibir,2026-11-05T09:00:00Z\n';
  const map={...emptyMapping(),eventId:'id',caseId:'caso',activity:'actividad',at:'fecha'};
  assert.equal(importEvents(header+row+row,map).duplicates,1);
  assert.throws(()=>importEvents(header+row+'one,A,Completar,2026-11-05T10:00:00Z',map),/diferentes/);
  assert.throws(()=>importEvents(header+row,{...map,resource:'missing'}),/columna/);
});

test('Dates require an actual calendar date and explicit time zone', () => {
  const map={...emptyMapping(),caseId:'caso',activity:'actividad',at:'fecha'};
  for(const date of ['2026-02-30T10:00:00Z','2026-11-05T24:00:00Z','05/11/2026 10:00','2026-11-05T10:00:00']) assert.throws(()=>importEvents(`caso,actividad,fecha\nA,Recibir,${date}`,map));
  assert.equal(importEvents('caso,actividad,fecha\nA,Recibir,2024-02-29T10:00:00+01:00',map).events[0].at,'2024-02-29T09:00:00.000Z');
});

test('Interview guidance responds to reported incidents and stops after eight topics', () => {
  const data=newInterview(); data.task='Registrar facturas';
  assert.match(nextQuestion(data)!,/Registrar facturas/);
  data.turns=Array.from({length:4},(_,i)=>({id:String(i),question:'¿Cómo?',answer:'Hay errores de importación',source:'guide',at:data.updatedAt}));
  assert.match(nextQuestion(data)!,/incidencias/); data.turns=[...data.turns,...data.turns];assert.equal(nextQuestion(data),null);
});

test('Findings compare reviewed evidence across departments and respect company boundaries', () => {
  const state=createEmptyState();
  const data={...newInterview(),status:'reviewed' as const,confirmed:true,task:'Registrar facturas de proveedores'};
  state.evidence=[studioRecord('Contabilidad','contabilidad',data),studioRecord('Compras','compras',{...data})];
  assert.equal(discoverFindings(state).length,1);
  state.evidence[1].intelligence={...data,company:'TQM'};assert.equal(discoverFindings(state).length,0);
  state.evidence[1].intelligence={...data,status:'draft'};assert.equal(discoverFindings(state).length,0);
});

test('A plan needs reviewed acceptance criteria and creates each delivery task once', () => {
  const process=createProcess({name:'Registrar pedidos',owner:'Compras',implementationCost:200});
  const plan=createBlueprint(process);assert.throws(()=>blueprintTasks(plan,process),/aprueba/);
  plan.status='approved';plan.approvedBy='Responsable';plan.steps.forEach(s=>s.checked=true);
  const tasks=blueprintTasks(plan,process);assert.equal(tasks.length,5);assert.equal(tasks.reduce((n,t)=>n+t.budget,0),200);
  process.operations={...emptyOperations(),tasks}; assert.equal(blueprintTasks(plan,process).length,5);
  assert.ok(tasks.every(t=>t.status==='todo'&&t.approval==='pending'));
  plan.steps[0].dependsOn=[plan.steps[4].id];assert.ok(validateIntelligence(plan).length);
});

test('n8n pilot export is inactive, gated and rejects credentials in its URL', () => {
  const plan=createBlueprint(createProcess({name:'Prueba'}));
  plan.targetUrl='https://example.test/pilot';const flow=n8nDraft(plan);
  assert.equal(flow.active,false);
  assert.equal(flow.nodes.find(n=>n.id==='atlas-context')!.parameters.assignments!.assignments.find(a=>a.name==='approvedForTest')!.value,false);
  plan.targetUrl='https://username:secret@example.test/pilot';assert.throws(()=>n8nDraft(plan),/credenciales/);
  plan.targetUrl='http://example.test/pilot';assert.throws(()=>n8nDraft(plan),/HTTPS/);
});

test('Simulator funds prerequisites together, excludes unknown budgets and reports cycles', () => {
  const a=createProcess({name:'Integrar',implementationCost:600,volumePerMonth:100,minutesPerCase:60,automatablePct:100,adoptionPct:100});
  const b=createProcess({name:'Capturar',implementationCost:400,volumePerMonth:100,minutesPerCase:6,automatablePct:100,adoptionPct:100});
  const data={...newScenario(),budget:900,processIds:[a.id,b.id],dependencies:[{processId:a.id,requires:[b.id]}]};
  const small=simulate([a,b],data);assert.deepEqual(small.selected,[b.id]);assert.equal(small.spent,400);
  const full=simulate([a,b],{...data,budget:1000});assert.equal(full.selected.length,2);assert.equal(full.hours,110);
  const cycle=simulate([a,b],{...data,dependencies:[...data.dependencies,{processId:b.id,requires:[a.id]}]});assert.equal(cycle.selected.length,0);assert.match(cycle.warnings.join(' '),/circulares/);
  const unknown=simulate([{...a,implementationCost:0}],{...newScenario(),processIds:[a.id]});assert.equal(unknown.selected.length,0);assert.match(unknown.warnings.join(' '),/sin inversión/);
});

test('Knowledge search excludes drafts and archives; revisions retain prior content', () => {
  const state=createEmptyState(),data=knowledge(),record=studioRecord('Registrar facturas','contabilidad',data);state.evidence=[record];
  assert.equal(knowledgeSources(state,'factura proveedor').length,0);
  record.intelligence=publishKnowledge(data,'Responsable','Revisión');assert.equal(knowledgeSources(state,'factura proveedor').length,1);
  record.intelligence=publishKnowledge({...record.intelligence,status:'draft',content:'Nuevo procedimiento revisado de facturas.'},'Responsable','Segunda revisión');
  assert.equal(record.intelligence.versions.length,2);assert.equal(record.intelligence.versions[0].content,data.content);
  record.intelligence.status='archived';assert.equal(knowledgeSources(state,'factura proveedor').length,0);
  assert.throws(()=>publishKnowledge({...data,sources:[{id:'a',title:' ',quote:''}]},'Responsable',''),/referencia/);
});

test('Backups retain typed intelligence and reject malformed or unreviewed published content', () => {
  const state=createEmptyState();state.evidence=[studioRecord('Guía','contabilidad',knowledge())];assert.equal(validateImport(JSON.parse(JSON.stringify(state))).valid,true);
  for(const bad of [null,{kind:'event-log',events:[null]},{kind:'blueprint',steps:[null],status:'approved'},{kind:'knowledge',status:'published',sources:[null]},{...newInterview(),frequency:1.5},{...knowledge(),status:'published',sources:[]}]) assert.ok(validateIntelligence(bad).length);
});

test('Imported opportunities cannot lose or duplicate their discovery source',()=>{
  const state=createEmptyState(),source=studioRecord('Entrevista','contabilidad',newInterview());state.evidence=[source];
  state.processes=[createProcess({name:'Prueba',intelligenceSourceId:source.id})];assert.equal(validateImport(state).valid,true);
  state.processes.push(createProcess({name:'Duplicada',intelligenceSourceId:source.id}));assert.equal(validateImport(state).valid,false);
  state.processes.pop();state.evidence=[];assert.equal(validateImport(state).valid,false);
});
