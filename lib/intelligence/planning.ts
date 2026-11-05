import { calculateMetrics, recommendation, type Process } from '../domain';
import { emptyOperations, type DeliveryTask } from '../operations';
import { id, stamp, type BlueprintData, type ScenarioData } from './types';

export function createBlueprint(process: Process): BlueprintData {
  const advice = recommendation(process);
  const specs = [
    ['Confirmar el proceso y su línea base', `Revisar «${process.name}» con ${process.owner || 'el responsable por asignar'}. Documentar entradas, salidas y excepciones.`, 'Línea base con fuente, muestra y validación del responsable.'],
    ['Verificar datos y acceso a los sistemas', `Comprobar permisos y posibilidades de integración con ${process.systems.join(', ') || 'las herramientas del proceso'}.`, 'Acceso de prueba y campos de entrada/salida documentados.'],
    ['Construir un piloto acotado', advice.approach, 'El piloto procesa la muestra acordada y registra los fallos sin ejecutar acciones fuera de su alcance.'],
    ['Probar casos habituales y excepciones', `Contrastar el resultado esperado de «${process.output || process.name}» con una revisión humana.`, 'Muestra, resultados, umbral aceptable y tratamiento de excepciones aprobados y adjuntos.'],
    ['Aprobar, medir y documentar', 'Asignar responsable de seguimiento, frecuencia, alertas y procedimiento de parada.', 'Aprobación registrada, monitorización probada y procedimiento de reversión disponible.'],
  ];
  const stepIds = specs.map(() => id());
  return { kind:'blueprint',version:1,updatedAt:stamp(),processId:process.id,processVersion:process.updatedAt,objective:`Mejorar ${process.name}`,approach:advice.approach,steps:specs.map((s,i)=>({id:stepIds[i],title:s[0],detail:s[1],acceptance:s[2],dependsOn:i?[stepIds[i-1]]:[],checked:false})),requirements:advice.prerequisites,risks:advice.safeguards,status:'draft',source:'rules',aiText:'',approvedBy:'',implementationBudget:process.implementationCost||null,monthlyBudget:process.monthlyRunningCost||null,targetUrl:'' };
}
export function blueprintTasks(plan: BlueprintData, process: Process): DeliveryTask[] {
  if (plan.status !== 'approved' || !plan.approvedBy.trim() || !plan.steps.every(s=>s.checked)) throw new Error('Revisa y aprueba todos los pasos antes de llevarlos a implantación.');
  const existing = process.operations?.tasks ?? [];
  const map = new Map(plan.steps.map(s=>[s.id, s.id]));
  return [...existing,...plan.steps.filter(s=>!existing.some(t=>t.id===s.id)).map((s,i)=>({id:s.id,title:s.title,owner:process.owner,dueDate:'',status:'todo' as const,dependsOn:s.dependsOn.map(d=>map.get(d)!).filter(Boolean),budget:i===0?plan.implementationBudget??0:0,acceptance:s.acceptance,evidence:'',approval:'pending' as const,approver:'',approvedAt:''}))];
}
export function n8nDraft(plan: BlueprintData) {
  // Export never activates a workflow, embeds secrets or bypasses human approval.
  const url = plan.targetUrl.trim();
  if (!url) throw new Error('Indica el webhook de prueba de tu integración antes de exportar el flujo.');
  let target: URL; try { target = new URL(url); } catch { throw new Error('Introduce una URL HTTPS válida.'); }
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Utiliza HTTPS y configura las credenciales en n8n, sin incluirlas en la URL.');
  const nodes = [
    {id:'atlas-trigger',name:'Iniciar prueba manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
    {id:'atlas-context',name:'Contexto del piloto',type:'n8n-nodes-base.set',typeVersion:3.4,position:[240,0],parameters:{assignments:{assignments:[{id:'process',name:'atlasProcessId',value:plan.processId,type:'string'},{id:'approval',name:'approvedForTest',value:false,type:'boolean'},{id:'objective',name:'objective',value:plan.objective,type:'string'}]},options:{}}},
    {id:'atlas-gate',name:'Aprobación de la prueba',type:'n8n-nodes-base.if',typeVersion:2.2,position:[480,0],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'approved',leftValue:'={{ $json.approvedForTest }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}},
    {id:'atlas-call',name:'Enviar al webhook de prueba',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[740,-100],parameters:{method:'POST',url:target.toString(),sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json) }}',options:{timeout:15000}}},
    {id:'atlas-stop',name:'Pendiente de revisión',type:'n8n-nodes-base.stopAndError',typeVersion:1,position:[740,120],parameters:{errorMessage:'Revisa el alcance, el destino y las credenciales del piloto. Después activa approvedForTest para una prueba manual.'}},
    {id:'atlas-note',name:'Guía ATLAS',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[160,-300],parameters:{content:`## ${plan.objective}\nBorrador de piloto. No automatiza por sí solo los sistemas del proceso.\n${plan.steps.map(s=>`- ${s.title}: ${s.acceptance}`).join('\n')}\nConfigura autenticación y una muestra sin datos reales antes de probar.`,width:720,height:240}},
  ];
  return {name:`ATLAS · ${plan.objective}`,active:false,nodes,connections:{'Iniciar prueba manual':{main:[[{node:'Contexto del piloto',type:'main',index:0}]]},'Contexto del piloto':{main:[[{node:'Aprobación de la prueba',type:'main',index:0}]]},'Aprobación de la prueba':{main:[[{node:'Enviar al webhook de prueba',type:'main',index:0}],[{node:'Pendiente de revisión',type:'main',index:0}]]}},settings:{executionOrder:'v1'},pinData:{},tags:[]};
}
export const newScenario = (): ScenarioData => ({kind:'scenario',version:1,updatedAt:stamp(),budget:10000,growthPct:0,adoptionPct:100,capacityHours:0,processIds:[],dependencies:[],objective:'hours',assumption:''});
export function simulate(processes: Process[], scenario: ScenarioData) {
  const candidates = processes.filter(p=>scenario.processIds.includes(p.id)&&!['discarded','implemented'].includes(p.status));
  const map = new Map(candidates.map(p=>[p.id,p]));
  const metrics = new Map(candidates.map(p=>[p.id,calculateMetrics({...p,volumePerMonth:p.volumePerMonth*(1+scenario.growthPct/100),adoptionPct:p.adoptionPct*scenario.adoptionPct/100})]));
  const warnings = new Set<string>();
  const closure = (key: string, active = new Set<string>(), result = new Set<string>()): Set<string> | null => {
    if (active.has(key)) {warnings.add('Hay dependencias circulares. Revisa las relaciones antes de decidir.');return null;}
    if(result.has(key))return result;
    if(!map.has(key)){warnings.add('Una dependencia está fuera de la selección. Inclúyela para evaluar ese proyecto.');return null;}
    active.add(key);
    for(const req of scenario.dependencies.find(d=>d.processId===key)?.requires??[])if(!closure(req,active,result))return null;
    active.delete(key);result.add(key);return result;
  };
  const selected = new Set<string>();let spent=0;
  // Dependency-aware greedy selection; deliberately labelled as a heuristic, not an optimum.
  for(let iteration=0;iteration<candidates.length;iteration++){
    let best: {ids:string[];cost:number;score:number}|null=null;
    for(const p of candidates){if(selected.has(p.id))continue;const group=closure(p.id);if(!group)continue;const ids=[...group].filter(k=>!selected.has(k));
      if(ids.some(k=>!map.get(k)!.implementationCost)){warnings.add('Las oportunidades sin inversión estimada quedan fuera de la recomendación.');continue;}
      const cost=ids.reduce((n,k)=>n+metrics.get(k)!.implementationCost,0),benefit=ids.reduce((n,k)=>n+(scenario.objective==='hours'?metrics.get(k)!.netHoursFreedMonthly:metrics.get(k)!.netCashBenefitMonthly),0);
      if(spent+cost>scenario.budget||benefit<=0)continue;const score=benefit/cost;if(!best||score>best.score)best={ids,cost,score};
    }
    if(!best)break;best.ids.forEach(k=>selected.add(k));spent+=best.cost;
  }
  const rows=candidates.map(p=>({process:p,metrics:metrics.get(p.id)!,selected:selected.has(p.id)}));
  const hours=rows.filter(r=>r.selected).reduce((n,r)=>n+r.metrics.netHoursFreedMonthly,0),cash=rows.filter(r=>r.selected).reduce((n,r)=>n+r.metrics.netCashBenefitMonthly,0);
  const workload=rows.reduce((n,r)=>n+r.metrics.baselineHoursMonthly,0),remaining=Math.max(0,workload-hours);
  if(candidates.some(p=>p.evidenceLevel==='estimate'))warnings.add('Parte de los datos son estimaciones sin observación validada.');
  if(candidates.some(p=>p.benefits?.overlapKey))warnings.add('Comprueba el reparto de beneficios compartidos antes de aprobar la inversión.');
  return {rows,selected:[...selected],spent,remainingBudget:scenario.budget-spent,hours,cash,workload,remaining,utilization:scenario.capacityHours>0?remaining/scenario.capacityHours*100:null,warnings:[...warnings],method:'Selección orientativa por beneficio/coste, respetando dependencias. No garantiza la combinación óptima.'};
}
