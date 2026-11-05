import { authenticate, bodyJSON, checkOrigin, failure, generate, headers, object, readJSON, response, ServiceError, UUID, type Environment } from '../_shared/intelligence.ts';

export function createIntelligenceHandler(env:Environment,fetcher:typeof fetch=fetch){return async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req,env)});
  if(req.method!=='POST')return response(req,env,405,{message:'Utiliza POST.'});
  try{
    checkOrigin(req,env);const body=await bodyJSON(req),workspaceId=body.workspaceId;
    const operation=body.operation;if(!['interview','blueprint','knowledge','procedure','transcribe'].includes(operation))throw new ServiceError(400,'Operación no reconocida.');
    if(!Array.isArray(body.recordIds)||!body.recordIds.length||body.recordIds.length>6||!body.recordIds.every((id:unknown)=>typeof id==='string'&&UUID.test(id))||new Set(body.recordIds).size!==body.recordIds.length)throw new ServiceError(400,'Selecciona entre uno y seis documentos válidos.');
    if(operation!=='knowledge'&&body.recordIds.length!==1)throw new ServiceError(400,'Selecciona un solo registro.');
    if(body.question!==undefined&&(typeof body.question!=='string'||body.question.length>2000))throw new ServiceError(400,'La pregunta supera el límite permitido.');
    const auth=await authenticate(req,env,workspaceId,fetcher);
    if(auth.role!=='admin'&&operation!=='knowledge')throw new ServiceError(403,'Esta acción necesita permiso de edición.');
    const settings=await readJSON(fetcher,`${auth.url}/rest/v1/atlas_records?workspace_id=eq.${workspaceId}&kind=eq.settings&select=data&limit=1`,auth.headers);
    if(settings?.[0]?.data?.aiEnabled!==true)throw new ServiceError(409,'Activa la IA conectada en Configuración antes de usarla.');
    const rows=await readJSON(fetcher,`${auth.url}/rest/v1/atlas_records?workspace_id=eq.${workspaceId}&kind=eq.evidence&id=in.(${body.recordIds.join(',')})&select=id,data,revision&limit=6`,auth.headers);
    if(!Array.isArray(rows)||rows.length!==body.recordIds.length)throw new ServiceError(404,'Algún documento no está disponible en este espacio.');
    const first=rows[0].data,data=first?.intelligence;
    let instruction='',context:unknown,sources:{id:string;title:string;quote:string}[]=[];
    if(operation==='interview'){
      if(data?.kind!=='interview')throw new ServiceError(400,'Selecciona una entrevista.');
      instruction='Actúa como entrevistador de procesos. Propón una única pregunta breve que profundice en una duda concreta de las respuestas. No repitas preguntas contestadas. Pide ejemplos o fuentes; no evalúes a la persona. Devuelve únicamente la pregunta, hasta 120 palabras.';
      context={task:data.task,role:data.role,sources:data.sources?.slice(0,5),turns:data.turns?.slice(-12).map((t:any)=>({question:t.question,answer:t.answer}))};
    }else if(operation==='blueprint'){
      if(data?.kind!=='blueprint'||!UUID.test(data.processId))throw new ServiceError(400,'Selecciona una propuesta.');
      const process=await readJSON(fetcher,`${auth.url}/rest/v1/atlas_records?workspace_id=eq.${workspaceId}&id=eq.${data.processId}&kind=eq.process&select=data&limit=1`,auth.headers);
      if(!process?.[0]?.data)throw new ServiceError(404,'El proceso de origen ya no está disponible.');
      const p=process[0].data;
      instruction='Revisa este plan de automatización. Devuelve una propuesta concreta: arquitectura candidata, pasos, requisitos, dependencias, pruebas de aceptación medibles, cuestiones pendientes, parada y reversión. Diferencia valores declarados de costes por confirmar. No cambies el estado de aprobación ni presentes el flujo como operativo.';
      context={process:{name:p.name,description:p.description,input:p.input,output:p.output,currentSteps:p.currentSteps,systems:p.systems},plan:{objective:data.objective,approach:data.approach,steps:data.steps,requirements:data.requirements,risks:data.risks,implementationBudget:data.implementationBudget,monthlyBudget:data.monthlyBudget}};
    }else if(operation==='knowledge'){
      if(!body.question?.trim())throw new ServiceError(400,'Escribe una pregunta.');
      if(rows.some(r=>r.data?.intelligence?.kind!=='knowledge'||r.data.intelligence.status!=='published'))throw new ServiceError(403,'Solo se consultan procedimientos publicados.');
      const words=body.question.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\W+/).filter((s:string)=>s.length>3);
      const normalize=(s:string)=>s.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      sources=rows.flatMap(r=>String(r.data.intelligence.content).split(/\n\s*\n/).flatMap(s=>s.match(/[\s\S]{1,1800}/g)??[]).map((quote,index)=>({id:`${r.id}:${index}`,title:r.data.name,quote}))).map(s=>({...s,score:words.reduce((n:number,w:string)=>n+(normalize(s.quote).includes(w)?1:0)+(normalize(s.title).includes(w)?3:0),0)})).filter(s=>s.score>0).sort((a,b)=>b.score-a.score).slice(0,6).map(({score,...s})=>s);
      if(!sources.length)return response(req,env,200,{text:'No hay información suficiente en los procedimientos seleccionados para responder.',sources:[],provider:'sources'});
      instruction='Responde únicamente con lo que acreditan las fuentes proporcionadas. Cita cada afirmación mediante [1], [2], etc. Si falta información dilo; no completes instrucciones con conocimientos externos. Distingue instrucciones documentadas y dudas. No incluyas fuentes ni enlaces que no estén en el contexto.';
      context={question:body.question,sources:sources.map((s,i)=>({number:i+1,...s}))};
    }else if(operation==='procedure'){
      if(data?.kind!=='knowledge'||!data.content?.trim())throw new ServiceError(400,'Guarda un documento con texto antes de preparar el procedimiento.');
      instruction='Transforma el texto en un procedimiento revisable: objetivo, requisitos, pasos numerados, comprobaciones, excepciones y dudas. Conserva el contenido real y sus referencias. Marca lo desconocido como Por confirmar. No inventes pasos, aprobaciones ni obligaciones.';
      context={title:first.name,text:data.content.slice(0,60000),sources:data.sources?.slice(0,10)};
    }else{
      if(data?.kind!=='knowledge'||!first.storagePath||!first.storagePath.startsWith(`${workspaceId}/${first.id}/`)||first.storagePath.includes('..')||!/^.+\.(mp3|mp4|m4a|wav|webm|ogg)$/i.test(first.fileName??''))throw new ServiceError(400,'Selecciona una grabación adjunta a este documento.');
      if(!(first.size>0)||first.size>20*1024*1024)throw new ServiceError(413,'La grabación debe ocupar como máximo 20 MB.');
      const key=env.get('OPENAI_API_KEY'),model=env.get('ATLAS_TRANSCRIPTION_MODEL');if(!key||!model)throw new ServiceError(503,'La transcripción aún no está configurada. Puedes pegar una transcripción revisada en el documento.');
      const media=await fetcher(`${auth.url}/storage/v1/object/authenticated/atlas-evidence/${first.storagePath.split('/').map(encodeURIComponent).join('/')}`,{headers:auth.headers,signal:AbortSignal.timeout(20000)});if(!media.ok)throw new ServiceError(404,'La grabación no está disponible.');const blob=await media.blob();if(blob.size>20*1024*1024)throw new ServiceError(413,'La grabación supera el tamaño permitido.');
      const form=new FormData();form.append('file',blob,first.fileName);form.append('model',model);form.append('language','es');form.append('response_format','json');
      const r=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(90000)});if(!r.ok)throw new ServiceError(502,'No se pudo transcribir la grabación. Revisa su formato o prueba con un fragmento más corto.');const result=await r.json();if(typeof result.text!=='string'||!result.text.trim()||result.text.length>120000)throw new ServiceError(502,'La transcripción no tiene un tamaño o contenido válido.');return response(req,env,200,{text:result.text,provider:'openai',sources:[{id:first.id,title:first.fileName,quote:'Transcripción automática pendiente de revisión.'}]});
    }
    const result=await generate(env,instruction,context,fetcher,operation==='interview'?400:3000);
    if(operation==='knowledge'){const citations=[...result.text.matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1]));if(!citations.length||citations.some(n=>n<1||n>sources.length))throw new ServiceError(502,'La respuesta contiene una referencia que no se pudo verificar. Vuelve a intentarlo.');}
    return response(req,env,200,{...result,sources,requiresReview:true});
  }catch(error){return failure(req,env,error);}
};}
