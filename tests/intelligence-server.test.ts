import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterviewHandler } from '../supabase/functions/interview/handler.ts';
import { createIntelligenceHandler } from '../supabase/functions/intelligence/handler.ts';
import { createMonitorHandler } from '../supabase/functions/monitor/handler.ts';
import { hashSecret, type Environment } from '../supabase/functions/_shared/intelligence.ts';
import { newInterview } from '../lib/intelligence/discovery.ts';
import { studioRecord } from '../lib/intelligence/types.ts';
import { createProcess } from '../lib/domain.ts';
import { emptyOperations, newAutomation } from '../lib/operations.ts';
import { calculateAlerts } from '../supabase/functions/_shared/monitoring.ts';

const workspace='c38f61a1-67d2-4cec-a9ee-d3318157f085', recordId='38a630b3-f38c-4d55-8187-6b17fd049aec', userId='597b8e38-31f8-4bb4-8297-67a5686926e0', token='a'.repeat(64);
const env = (extra:Record<string,string>={}):Environment => ({get:name=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-test',SUPABASE_ANON_KEY:'anon-test',ATLAS_ALLOWED_ORIGINS:'https://atlas.test',...extra})[name]});
const req=(body:unknown,auth='')=>new Request('https://test.supabase.co/functions/v1/test',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify(body)});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

async function interviewFixture(options:{revoked?:boolean;expired?:boolean;conflict?:boolean;providerFailure?:boolean}={}){
  const data={...newInterview(),role:'Puesto de prueba',person:'No debe exponerse',task:'Revisar pedidos',share:{hash:await hashSecret(token),expiresAt:new Date(Date.now()+(options.expired?-1:86400000)).toISOString(),revoked:!!options.revoked}};
  let row={id:recordId,workspace_id:workspace,revision:3,data:{...studioRecord('Entrevista','compras',data),id:recordId,storagePath:'private-file'}};
  const calls:{url:string;init?:RequestInit}[]=[];
  const fetcher=async(input:any,init?:RequestInit)=>{const url=String(input);calls.push({url,init});
    if(url.includes('api.openai.com'))return json({error:'private provider details'},options.providerFailure?500:200);
    if(url.includes('kind=eq.settings'))return json([{data:{aiEnabled:true}}]);
    if(init?.method==='PATCH'){if(options.conflict)return json([]);const value=JSON.parse(String(init.body));row={...row,...value};return json([{revision:row.revision}]);}
    assert.equal(new URL(url).searchParams.get('data->intelligence->share->>hash'),`eq.${await hashSecret(token)}`);
    return json([row]);
  };
  const handler=createInterviewHandler(env({ATLAS_AI_MODEL:'test-model',OPENAI_API_KEY:'provider-test'}),fetcher as typeof fetch);
  return {handler,calls,row:()=>row};
}

test('Participant response reveals only its interview and never the token, person or file path',async()=>{
  const f=await interviewFixture(),r=await f.handler(req({token,action:'read'}));assert.equal(r.status,200);
  const body=await r.json();assert.equal(body.task,'Revisar pedidos');assert.equal(body.revision,3);
  assert.ok(!JSON.stringify(body).includes('No debe exponerse'));assert.ok(!JSON.stringify(body).includes('private-file'));assert.ok(!JSON.stringify(body).includes(token));
  assert.equal(r.headers.get('cache-control'),'no-store');
});
test('Expired, revoked and malformed participant tokens are rejected before any write',async()=>{
  for(const options of [{expired:true},{revoked:true}]){const f=await interviewFixture(options);assert.equal((await f.handler(req({token,action:'answer',revision:3,answer:'Prueba'}))).status,404);assert.ok(f.calls.every(c=>c.init?.method!=='PATCH'));}
  let called=false;const handler=createInterviewHandler(env(),(async()=>{called=true;return json([]);}) as typeof fetch);
  assert.equal((await handler(req({token:'bad',action:'read'}))).status,404);assert.equal(called,false);
});
test('Participant writes are revision checked and scoped to the exact workspace and record',async()=>{
  const f=await interviewFixture();assert.equal((await f.handler(req({token,action:'answer',revision:2,answer:'Borrador'}))).status,409);
  const r=await f.handler(req({token,action:'answer',revision:3,answer:'Reviso una hoja.'}));assert.equal(r.status,200);
  const write=f.calls.find(c=>c.init?.method==='PATCH')!,query=new URL(write.url).searchParams;
  assert.equal(query.get('workspace_id'),`eq.${workspace}`);assert.equal(query.get('id'),`eq.${recordId}`);assert.equal(query.get('revision'),'eq.3');assert.equal(f.row().data.intelligence.turns.length,1);
  const conflict=await interviewFixture({conflict:true});assert.equal((await conflict.handler(req({token,action:'answer',revision:3,answer:'Prueba'}))).status,409);
});
test('Provider failure preserves the answer and continues with the guide; no AI call without consent',async()=>{
  const f=await interviewFixture({providerFailure:true});const r=await f.handler(req({token,action:'answer',revision:3,answer:'Respuesta conservada',aiConsent:true}));assert.equal(r.status,200);
  const body=await r.json();assert.equal(body.turns[0].answer,'Respuesta conservada');assert.equal(body.questionSource,'guide');
  const g=await interviewFixture();await g.handler(req({token,action:'answer',revision:3,answer:'Sin consentimiento'}));assert.ok(g.calls.every(c=>!c.url.includes('api.openai.com')));
});
test('Submitted interviews are locked against additional participant writes',async()=>{
  const f=await interviewFixture();await f.handler(req({token,action:'answer',revision:3,answer:'Primera respuesta'}));assert.equal((await f.handler(req({token,action:'submit',revision:4}))).status,200);assert.equal((await f.handler(req({token,action:'answer',revision:5,answer:'No permitida'}))).status,409);
});

test('Connected intelligence requires authentication, membership and editing permission',async()=>{
  const body={workspaceId:workspace,recordIds:[recordId],operation:'procedure'};
  const handler=createIntelligenceHandler(env(),(async()=>{throw new Error('Unexpected request');}) as typeof fetch);
  assert.equal((await handler(req(body))).status,401);
  for(const memberships of [[],[{role:'director'}]]){
    const fetcher=async(input:any)=>String(input).includes('/auth/')?json({id:userId}):json(memberships);
    assert.equal((await createIntelligenceHandler(env(),fetcher as typeof fetch)(req(body,'jwt-test'))).status,403);
  }
});
test('Origin restrictions and oversized requests stop before data is read',async()=>{
  const handler=createIntelligenceHandler(env(),(async()=>{throw new Error('Unexpected request');}) as typeof fetch);
  const foreign=req({});foreign.headers.set('Origin','https://foreign.test');assert.equal((await handler(foreign)).status,403);
  assert.equal((await handler(req({text:'x'.repeat(25000)}))).status,413);
});
test('Knowledge answers reject unpublished sources before reaching the provider',async()=>{
  const fetcher=async(input:any)=>{const url=String(input);if(url.includes('/auth/'))return json({id:userId});if(url.includes('atlas_memberships'))return json([{role:'director'}]);if(url.includes('kind=eq.settings'))return json([{data:{aiEnabled:true}}]);if(url.includes('kind=eq.evidence'))return json([{id:recordId,data:{intelligence:{kind:'knowledge',status:'draft'}}}]);throw new Error('Provider must not be called');};
  assert.equal((await createIntelligenceHandler(env(),fetcher as typeof fetch)(req({workspaceId:workspace,recordIds:[recordId],operation:'knowledge',question:'Facturas'},'jwt-test'))).status,403);
});
test('Scheduled monitoring rejects browsers and invalid secrets; only scans configured workspaces',async()=>{
  const secret='s'.repeat(40),calls:string[]=[];
  const handler=createMonitorHandler(env({ATLAS_MONITOR_SECRET:secret,ATLAS_MONITOR_WORKSPACES:workspace}),(async(input:any)=>{calls.push(String(input));return json([]);}) as typeof fetch);
  assert.equal((await handler(req({},'wrong'))).status,401);
  const browser=req({},secret);browser.headers.set('Origin','https://atlas.test');assert.equal((await handler(browser)).status,403);
  assert.equal(calls.length,0);
  const result=await handler(req({workspaceId:'ignored'},secret));assert.equal(result.status,200);assert.equal(calls.length,1);assert.match(calls[0],new RegExp(`workspace_id=eq.${workspace}`));
});

test('Alert history retains acknowledgement and delivery, resolves and reopens incidents',()=>{
  const process=createProcess({name:'Proceso de prueba'}),automation=newAutomation();
  process.operations={...emptyOperations(),automations:[automation]};
  const first=calculateAlerts([process],[],new Date('2026-11-05T10:00:00Z'));
  assert.equal(first.length,1);first[0].acknowledgedAt='2026-11-05T10:05:00Z';first[0].notifiedAt='2026-11-05T10:02:00Z';
  const again=calculateAlerts([process],first,new Date('2026-11-05T11:00:00Z'));assert.deepEqual(again,first);
  automation.active=false;const resolved=calculateAlerts([process],again,new Date('2026-11-05T12:00:00Z'));assert.equal(resolved[0].resolvedAt,'2026-11-05T12:00:00.000Z');
  automation.active=true;const reopened=calculateAlerts([process],resolved,new Date('2026-11-05T13:00:00Z'));assert.equal(reopened.length,2);assert.equal(reopened[0].acknowledgedAt,'');assert.equal(reopened[0].notifiedAt,undefined);
});

test('Server monitor records successful checks and retries failed notifications without marking delivered',async()=>{
  const secret='s'.repeat(40),process=createProcess({name:'Proceso ficticio'}),automation=newAutomation();process.operations={...emptyOperations(),automations:[automation]};
  const monitor=studioRecord('Seguimiento','direccion',{kind:'monitor' as const,version:1 as const,updatedAt:new Date().toISOString(),enabled:true,lastCheckedAt:'',alerts:[],delivery:'in-app' as const});
  const calls:{url:string;init?:RequestInit}[]=[];let saved:any;
  const fetcher=async(input:any,init?:RequestInit)=>{const url=String(input);calls.push({url,init});if(url.startsWith('https://notify.test'))return json({},503);if(init?.method==='PATCH'){saved=JSON.parse(String(init.body));return json([{revision:2}]);}if(url.includes('kind=eq.process'))return json([{data:process}]);return json([{id:recordId,data:monitor,revision:1}]);};
  const handler=createMonitorHandler(env({ATLAS_MONITOR_SECRET:secret,ATLAS_MONITOR_WORKSPACES:workspace,ATLAS_NOTIFICATION_WEBHOOKS:JSON.stringify({[workspace]:{url:'https://notify.test/alerts'}})}),fetcher as typeof fetch);
  const response=await handler(req({},secret));assert.equal(response.status,200);assert.equal((await response.json()).notificationFailures,1);
  assert.ok(saved.data.intelligence.lastServerCheckAt);assert.ok(saved.data.intelligence.notificationError);assert.equal(saved.data.intelligence.alerts[0].notifiedAt,undefined);
  const delivery=calls.find(c=>c.url.startsWith('https://notify.test'))!;assert.equal(delivery.init?.redirect,'error');assert.ok((delivery.init?.headers as Record<string,string>)['Idempotency-Key']);
  assert.equal(new URL(calls.find(c=>c.init?.method==='PATCH'&&c.url.includes('supabase'))!.url).searchParams.get('revision'),'eq.1');
});

test('Knowledge generation rejects missing or fabricated citations',async()=>{
  for(const answer of ['Una respuesta sin cita.','Se hace así [9].']){
    const fetcher=async(input:any)=>{const url=String(input);if(url.includes('/auth/'))return json({id:userId});if(url.includes('atlas_memberships'))return json([{role:'director'}]);if(url.includes('kind=eq.settings'))return json([{data:{aiEnabled:true}}]);if(url.includes('kind=eq.evidence'))return json([{id:recordId,data:{name:'Facturas',intelligence:{kind:'knowledge',status:'published',content:'Las facturas se revisan antes del registro.'}}}]);return json({output:[{content:[{type:'output_text',text:answer}]}]});};
    const handler=createIntelligenceHandler(env({ATLAS_AI_MODEL:'test',OPENAI_API_KEY:'test'}),fetcher as typeof fetch);
    assert.equal((await handler(req({workspaceId:workspace,recordIds:[recordId],operation:'knowledge',question:'¿Cómo revisamos las facturas?'},'jwt-test'))).status,502);
  }
});
