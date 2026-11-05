import type { AtlasState } from '../domain';
import { normalize } from '../job-descriptions';
import { recordsOf, type SourceRef, type KnowledgeData } from './types';

export function knowledgeSources(state: AtlasState, question: string): SourceRef[] {
  const tokens=normalize(question).split(' ').filter(s=>s.length>3);
  if(!tokens.length)return [];
  const sources:SourceRef[]=[];
  for(const e of recordsOf(state.evidence,'knowledge'))if(e.intelligence.status==='published'){
    const chunks=e.intelligence.content.split(/\n\s*\n/).flatMap(s=>s.match(/[\s\S]{1,1800}/g)??[]);
    chunks.forEach((text,index)=>sources.push({id:`${e.id}:${index}`,title:`${e.name} · v${e.intelligence.versions.at(-1)?.number??1}`,quote:text}));
  }
  const scored=sources.map(s=>({source:s,score:tokens.reduce((n,t)=>n+(normalize(s.title).includes(t)?3:0)+(normalize(s.quote).includes(t)?1:0),0)})).filter(s=>s.score>0).sort((a,b)=>b.score-a.score);
  return scored.slice(0,6).map(s=>s.source);
}
export function procedureDraft(text:string,title:string) {
  const cleaned=text.replace(/\r/g,'').trim();
  if(!cleaned)throw new Error('Añade el texto o una transcripción antes de preparar el procedimiento.');
  const paragraphs=cleaned.split(/\n+|(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.length>12).slice(0,30);
  return `# ${title}\n\n## Objetivo\nPor confirmar con el responsable.\n\n## Procedimiento propuesto\n${paragraphs.map((p,i)=>`${i+1}. ${p}`).join('\n')}\n\n## Excepciones y comprobaciones\nPor documentar y validar antes de publicar.\n\n## Fuente\nBorrador estructurado a partir del texto aportado. Revisar orden, instrucciones y datos antes de publicar.`;
}
export function publishKnowledge(data:KnowledgeData,author:string,source:string):KnowledgeData {
  if(!author.trim()||!data.owner.trim()||!data.content.trim()||!data.sources.length||data.sources.some(s=>!s.title.trim()))throw new Error('Añade contenido, responsable y una referencia identificada para cada fuente antes de publicar.');
  const last=data.versions.at(-1);if(last?.content===data.content&&data.status==='published')return data;
  if(data.versions.length>=20)throw new Error('Este documento conserva 20 versiones. Exporta el historial y crea un documento sucesor.');
  return {...data,status:'published',versions:[...data.versions,{number:(last?.number??0)+1,content:data.content,at:new Date().toISOString(),author,source,sources:structuredClone(data.sources)}]};
}
