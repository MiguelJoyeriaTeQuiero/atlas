export interface Alert { key:string;processId:string;automationId:string;title:string;detectedAt:string;resolvedAt:string;acknowledgedAt:string;notifiedAt?:string }
export function calculateAlerts(processes:any[],previous:Alert[],now=new Date()):Alert[]{
  const active=new Map<string,Alert>(),time=now.getTime();
  const month=(at:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'}).format(new Date(at));
  for(const p of processes)for(const a of p.operations?.automations??[]){
    if(!a.active)continue;const runs=[...(a.runs??[])].filter(r=>Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)<=time).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const recent=runs.filter(r=>Date.parse(r.at)>=time-30*86400000),cases=recent.reduce((n,r)=>n+r.cases,0),errors=recent.reduce((n,r)=>n+r.errors,0);
    const errorPct=cases?errors/cases*100:recent.length?recent.filter(r=>r.status!=='success').length/recent.length*100:null;
    const cost=runs.filter(r=>month(r.at)===month(now.toISOString())).reduce((n,r)=>n+r.cost,0),pending=runs.filter(r=>!r.resolvedAt).reduce((n,r)=>n+r.pendingExceptions,0),titles:string[]=[];
    if(!runs.length)titles.push('Sin ejecuciones recibidas');else if(a.expectedEveryHours>0&&time-Date.parse(runs[0].at)>a.expectedEveryHours*3600000)titles.push('Ejecución esperada sin recibir');
    if(runs[0]?.status==='error')titles.push('Última ejecución fallida');if(errorPct!==null&&errorPct>a.errorThresholdPct)titles.push('Errores por encima del umbral');if(pending)titles.push(`${pending} excepciones pendientes`);if(a.monthlyBudget>0&&cost>a.monthlyBudget)titles.push('Presupuesto mensual superado');
    for(const title of titles){const key=`${p.id}:${a.id}:${title.replace(/^\d+ /,'')}`,old=previous.find(x=>x.key===key&&!x.resolvedAt);active.set(key,{key,processId:p.id,automationId:a.id,title,detectedAt:old?.detectedAt??now.toISOString(),resolvedAt:'',acknowledgedAt:old?.acknowledgedAt??'',...(old?.notifiedAt?{notifiedAt:old.notifiedAt}:{})});}
  }
  const resolved=previous.filter(a=>a.resolvedAt||!active.has(a.key)).map(a=>a.resolvedAt?a:{...a,resolvedAt:now.toISOString()});
  return [...active.values(),...resolved].slice(0,500);
}
