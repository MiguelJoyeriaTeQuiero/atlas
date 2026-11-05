import { backend, backendHeaders, bodyJSON, checkOrigin, failure, generate, hashSecret, headers, readJSON, response, ServiceError, type Environment } from '../_shared/intelligence.ts';
function question(data:any){
  const context=data.task?`«${data.task}»`:'esta tarea';
  const answered=JSON.stringify(data.turns).toLocaleLowerCase();
  return [
    `¿Cómo realizas ${context}, desde que empieza hasta que termina? Cuéntame un caso reciente.`,
    '¿Qué herramientas utilizas y qué información copias o introduces a mano entre ellas?',
    '¿Cuántas veces realizas esta tarea al mes? Si no lo sabes, indica cómo podríamos comprobarlo.',
    '¿Cuánto tiempo de trabajo activo requiere un caso habitual? Separa el tiempo de espera.',
    /error|excepci|incidencia/.test(answered)?'Has mencionado incidencias. ¿Cuál es la más habitual y cómo la resuelves?':'¿Qué puede salir mal o hacer que un caso necesite un tratamiento diferente?',
    '¿Qué parte depende de otra persona o departamento? ¿Qué le entregas y cuánto esperas?',
    '¿Qué parte es manual, cuál está parcialmente automatizada y cuál funciona ya de forma automática?',
    '¿Qué evidencia podemos revisar para confirmar los tiempos y el volumen? ¿Qué cambiarías primero?',
  ][data.turns.length]??null;
}
export function createInterviewHandler(env:Environment,fetcher:typeof fetch=fetch){return async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req,env)});
  if(req.method!=='POST')return response(req,env,405,{message:'Utiliza POST.'});
  try{
    checkOrigin(req,env);const body=await bodyJSON(req,12000);
    if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw new ServiceError(404,'Este enlace no está disponible. Solicita uno nuevo al responsable.');
    if(!['read','answer','submit'].includes(body.action))throw new ServiceError(400,'Acción no válida.');
    const {url,key}=backend(env,true),h=backendHeaders(key),hash=await hashSecret(body.token);
    const query=new URL(`${url}/rest/v1/atlas_records`);query.searchParams.set('kind','eq.evidence');query.searchParams.set('data->intelligence->share->>hash',`eq.${hash}`);query.searchParams.set('select','id,workspace_id,data,revision');query.searchParams.set('limit','2');
    const rows=await readJSON(fetcher,query.toString(),h),row=rows?.[0],data=row?.data?.intelligence;
    if(!Array.isArray(rows)||rows.length!==1||data?.kind!=='interview'||data.share?.revoked||Date.parse(data.share?.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(data.share?.expiresAt)))throw new ServiceError(404,'Este enlace ha caducado o ha sido revocado. Solicita uno nuevo al responsable.');
    const safe=(value:any,revision:number)=>({title:row.data.name,task:value.task,role:value.role,status:value.status,turns:value.turns.map((t:any)=>({question:t.question,answer:t.answer,source:t.source})),question:value.status==='reviewed'||value.status==='submitted'?null:value.pendingQuestion?.text||question(value),questionSource:value.pendingQuestion?.source??'guide',revision,expiresAt:value.share.expiresAt});
    if(body.action==='read')return response(req,env,200,safe(data,row.revision));
    if(data.status==='reviewed'||data.status==='submitted')throw new ServiceError(409,'La entrevista ya se ha enviado. El responsable conserva tus respuestas para revisarlas.');
    if(body.revision!==row.revision)throw new ServiceError(409,'La entrevista ha cambiado. Actualiza la página antes de continuar; conserva tu respuesta para volver a enviarla.');
    let next={...data,updatedAt:new Date().toISOString()};
    if(body.action==='answer'){
      if(typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>6000||data.turns.length>=8)throw new ServiceError(400,'Escribe una respuesta de hasta 6.000 caracteres.');
      const q=data.pendingQuestion?.text||question(data);if(!q)throw new ServiceError(409,'La entrevista está lista para enviar.');
      next={...next,status:'in-progress',turns:[...data.turns,{id:crypto.randomUUID(),question:q,answer:body.answer.trim(),source:data.pendingQuestion?.source??'guide',at:new Date().toISOString()}]};
      delete next.pendingQuestion;
      const nextGuide=question(next);
      if(nextGuide){
        const settings=await readJSON(fetcher,`${url}/rest/v1/atlas_records?workspace_id=eq.${row.workspace_id}&kind=eq.settings&select=data&limit=1`,h);
        // Explicit participant consent is scoped to this request. A failed provider never loses the answer.
        if(body.aiConsent===true&&settings?.[0]?.data?.aiEnabled===true){try{const result=await generate(env,'Eres un entrevistador de procesos. Reescribe la próxima pregunta de la guía usando el contexto de las respuestas para que sea concreta. Conserva el tema de esa pregunta. Devuelve solo una pregunta de hasta 100 palabras, sin evaluar al empleado.',{task:data.task,role:data.role,nextQuestion:nextGuide,turns:next.turns.slice(-4).map((t:any)=>({question:t.question,answer:t.answer}))},fetcher,250);next.pendingQuestion={text:result.text.slice(0,1000),source:'ai'};}catch{next.pendingQuestion={text:nextGuide,source:'guide'};}}
        else next.pendingQuestion={text:nextGuide,source:'guide'};
      }
    }else{if(!data.turns.length)throw new ServiceError(400,'Responde al menos una pregunta antes de enviar.');next.status='submitted';delete next.pendingQuestion;}
    const update=new URL(`${url}/rest/v1/atlas_records`);update.searchParams.set('workspace_id',`eq.${row.workspace_id}`);update.searchParams.set('id',`eq.${row.id}`);update.searchParams.set('kind','eq.evidence');update.searchParams.set('revision',`eq.${row.revision}`);update.searchParams.set('data->intelligence->share->>hash',`eq.${hash}`);update.searchParams.set('select','revision');
    const r=await fetcher(update.toString(),{method:'PATCH',headers:{...h,Prefer:'return=representation'},body:JSON.stringify({data:{...row.data,intelligence:next},revision:row.revision+1,updated_at:next.updatedAt}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new ServiceError(502,'No se pudo guardar tu respuesta. Conserva el texto e inténtalo de nuevo.');const changed=await r.json();if(changed.length!==1)throw new ServiceError(409,'La entrevista cambió antes de guardar. Actualiza y vuelve a intentarlo.');
    return response(req,env,200,safe(next,row.revision+1));
  }catch(error){return failure(req,env,error);}
};}
