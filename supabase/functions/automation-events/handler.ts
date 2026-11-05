/** Scoped server-to-server event ingestion. No user attachments or credentials are returned. */
type Environment = { get(name: string): string | undefined };
type Grant = { token: string; workspaceId: string; processId: string; automationId: string };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function sameSecret(a: string, b: string) { const encode = new TextEncoder(); const hashes = await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',encode.encode(s)))); const x=new Uint8Array(hashes[0]),y=new Uint8Array(hashes[1]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0; }
export function createAutomationEventHandler(env: Environment, requestFetch: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
    // These credentials belong in server integrations, never in a browser.
    if (request.headers.get('origin')) return json(403,{error:'SERVER_TO_SERVER_ONLY'});
    const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
    if (!token || token.length < 32 || token.length > 512) return json(401,{error:'UNAUTHORIZED'});
    let grants: Grant[];
    try { grants=JSON.parse(env.get('ATLAS_AUTOMATION_TOKENS')??'[]'); if(!Array.isArray(grants))throw new Error(); } catch { return json(503,{error:'INTEGRATION_NOT_CONFIGURED'}); }
    let grant:Grant|undefined;for(const item of grants)if(object(item)&&typeof item.token==='string'&&item.token.length>=32&&await sameSecret(item.token,token)){grant=item;break;}
    if(!grant)return json(401,{error:'UNAUTHORIZED'});
    const base=env.get('SUPABASE_URL'),key=env.get('SUPABASE_SERVICE_ROLE_KEY');if(!base||!key)return json(503,{error:'BACKEND_NOT_CONFIGURED'});
    try {
      if(Number(request.headers.get('content-length')??0)>32768)return json(413,{error:'PAYLOAD_TOO_LARGE'});
      const reader=request.body?.getReader();if(!reader)return json(400,{error:'EMPTY_BODY'});let bytes=0;const chunks:Uint8Array[]=[];
      while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32768){await reader.cancel();return json(413,{error:'PAYLOAD_TOO_LARGE'});}chunks.push(value);}
      const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}let payload:any;try{payload=JSON.parse(new TextDecoder().decode(buffer));}catch{return json(400,{error:'INVALID_JSON'});}
      if(!object(payload)||payload.workspaceId!==grant.workspaceId||payload.processId!==grant.processId||payload.automationId!==grant.automationId)return json(403,{error:'SCOPE_MISMATCH'});
      const r=payload.run;if(!object(r)||typeof r.externalId!=='string'||!r.externalId.trim()||r.externalId.length>200||typeof r.at!=='string'||!Number.isFinite(Date.parse(r.at))||Date.parse(r.at)>Date.now()+300000)return json(400,{error:'INVALID_EVENT_REFERENCE_OR_DATE'});
      for(const field of ['cases','errors','durationSeconds','cost','pendingExceptions'])if(typeof r[field]!=='number'||!Number.isFinite(r[field])||r[field]<0||r[field]>1e12)return json(400,{error:'INVALID_EVENT_NUMBERS'});
      if(![r.cases,r.errors,r.pendingExceptions].every(Number.isInteger)||r.errors>r.cases||r.pendingExceptions>r.cases||!['success','error','partial'].includes(r.status)||typeof r.detail!=='string'||r.detail.length>12000)return json(400,{error:'INVALID_EVENT'});
      const run={id:crypto.randomUUID(),externalId:r.externalId.trim(),at:new Date(r.at).toISOString(),status:r.status,cases:r.cases,errors:r.errors,durationSeconds:r.durationSeconds,cost:r.cost,pendingExceptions:r.pendingExceptions,detail:r.detail,source:'webhook',resolvedAt:'',resolution:''};
      const url=new URL(`${base.replace(/\/$/,'')}/rest/v1/atlas_records`);url.searchParams.set('workspace_id',`eq.${grant.workspaceId}`);url.searchParams.set('id',`eq.${grant.processId}`);url.searchParams.set('kind','eq.process');
      const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
      for(let attempt=0;attempt<4;attempt++){
        const response=await requestFetch(url.toString()+'&select=data,revision',{headers,signal:AbortSignal.timeout(12000)});if(!response.ok)return json(502,{error:'READ_FAILED'});
        const rows=await response.json();const row=rows?.[0];if(!row)return json(404,{error:'PROCESS_NOT_FOUND'});
        const data=row.data, automations=data.operations?.automations;const automation=Array.isArray(automations)?automations.find((a:any)=>a.id===grant!.automationId):undefined;if(!automation||!Array.isArray(automation.runs))return json(404,{error:'AUTOMATION_NOT_FOUND'});
        if(automation.runs.some((existing:any)=>existing.externalId===run.externalId))return json(200,{ok:true,duplicate:true});
        if(automation.runs.length>=1000)return json(409,{error:'HISTORY_LIMIT',message:'Exporta el historial y crea otro registro de automatización para continuar.'});
        const updatedAt=new Date().toISOString();const next={...data,updatedAt,operations:{...data.operations,automations:automations.map((a:any)=>a.id===automation.id?{...a,runs:[run,...a.runs]}:a)}};
        if(new TextEncoder().encode(JSON.stringify(next)).byteLength>900000)return json(409,{error:'PROCESS_SIZE_LIMIT'});
        const updateUrl=new URL(url);updateUrl.searchParams.set('revision',`eq.${row.revision}`);updateUrl.searchParams.set('select','revision');
        const updated=await requestFetch(updateUrl.toString(),{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({data:next,revision:row.revision+1,updated_at:updatedAt}),signal:AbortSignal.timeout(12000)});
        if(!updated.ok)return json(502,{error:'WRITE_FAILED'});const changed=await updated.json();if(Array.isArray(changed)&&changed.length===1)return json(201,{ok:true,duplicate:false});
      }
      return json(409,{error:'CONCURRENT_UPDATE',message:'Reintenta con el mismo externalId.'});
    }catch{return json(502,{error:'INGESTION_FAILED',message:'Reintenta con el mismo externalId.'});}
  };
}
