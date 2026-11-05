import { backend, backendHeaders, equalSecret, hashSecret, readJSON, ServiceError, UUID, type Environment } from '../_shared/intelligence.ts';
import { calculateAlerts } from '../_shared/monitoring.ts';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createMonitorHandler(env:Environment,fetcher:typeof fetch=fetch){return async(req:Request)=>{
  if(req.method!=='POST')return json(405,{message:'Utiliza POST.'});
  if(req.headers.get('origin'))return json(403,{message:'Solo se admiten llamadas del servidor.'});
  const expected=env.get('ATLAS_MONITOR_SECRET'),token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if(!expected||expected.length<32)return json(503,{message:'El seguimiento no está configurado.'});
  if(!token||!await equalSecret(token,expected))return json(401,{message:'No autorizado.'});
  try{
    const workspaces=(env.get('ATLAS_MONITOR_WORKSPACES')??'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!workspaces.length||workspaces.length>50||workspaces.some(s=>!UUID.test(s)))throw new ServiceError(503,'Configura los espacios autorizados para el seguimiento.');
    let destinations:Record<string,{url:string;token?:string}>={};try{destinations=JSON.parse(env.get('ATLAS_NOTIFICATION_WEBHOOKS')??'{}');}catch{throw new ServiceError(503,'Revisa la configuración de notificaciones.');}
    const {url,key}=backend(env,true),h=backendHeaders(key);let checked=0,conflicts=0,notificationFailures=0;
    for(const workspace of workspaces){
      const monitors=await readJSON(fetcher,`${url}/rest/v1/atlas_records?workspace_id=eq.${workspace}&kind=eq.evidence&data->intelligence->>kind=eq.monitor&data->intelligence->>enabled=eq.true&select=id,data,revision&limit=2`,h);
      if(!monitors.length)continue;if(monitors.length!==1)throw new ServiceError(409,'Hay varios registros de seguimiento en un espacio. Conserva uno activo.');
      const row=monitors[0],data=row.data.intelligence,processes:any[]=[];
      for(let offset=0;offset<10000;offset+=200){const batch=await readJSON(fetcher,`${url}/rest/v1/atlas_records?workspace_id=eq.${workspace}&kind=eq.process&select=data&order=id&limit=200&offset=${offset}`,h);processes.push(...batch.map((r:any)=>r.data));if(batch.length<200)break;if(offset===9800)throw new ServiceError(413,'El espacio supera el límite del seguimiento.');}
      const at=new Date().toISOString(),alerts=calculateAlerts(processes,data.alerts??[],new Date(at));let notificationError='';
      const destination=destinations[workspace];
      if(destination){
        let target:URL;try{target=new URL(destination.url);}catch{throw new ServiceError(503,'El destino de notificaciones no tiene una URL válida.');}
        if(target.protocol!=='https:'||target.username||target.password)throw new ServiceError(503,'El destino de notificaciones debe usar HTTPS.');
        for(const alert of alerts.filter(a=>!a.resolvedAt&&!a.notifiedAt).slice(0,20)){
          try{const r=await fetcher(target.toString(),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Idempotency-Key':await hashSecret(`${workspace}:${alert.key}:${alert.detectedAt}`),...(destination.token?{Authorization:`Bearer ${destination.token}`}:{})},body:JSON.stringify({type:'atlas.automation.alert',workspaceId:workspace,processId:alert.processId,automationId:alert.automationId,title:alert.title,detectedAt:alert.detectedAt}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error();alert.notifiedAt=at;}catch{notificationFailures++;notificationError='No se pudo entregar alguna notificación. Se volverá a intentar en la próxima comprobación.';}
        }
      }
      const next={...row.data,intelligence:{...data,updatedAt:at,lastCheckedAt:at,lastServerCheckAt:at,delivery:destination?'webhook':'in-app',alerts,notificationError}};
      const r=await fetcher(`${url}/rest/v1/atlas_records?workspace_id=eq.${workspace}&id=eq.${row.id}&revision=eq.${row.revision}&select=revision`,{method:'PATCH',headers:{...h,Prefer:'return=representation'},body:JSON.stringify({data:next,revision:row.revision+1,updated_at:at}),signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new ServiceError(502,'No se pudo guardar la comprobación.');const changed=await r.json();if(changed.length!==1){conflicts++;continue;}checked++;
    }
    return json(200,{checked,conflicts,notificationFailures});
  }catch(e){return json(e instanceof ServiceError?e.status:502,{message:e instanceof ServiceError?e.message:'La comprobación no pudo completarse.'});}
};}
