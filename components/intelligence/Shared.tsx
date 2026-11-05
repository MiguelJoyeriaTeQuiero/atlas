'use client';
import { useState, useEffect, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import type { useAtlas } from '@/lib/store';
import { DEPARTMENTS, type Company, type DepartmentId, type Process } from '@/lib/domain';
import type { IntelligenceData, StudioRecord } from '@/lib/intelligence/types';
export { Action, Field, Numeric, ErrorNote, Tag, fmt, euro, dateLabel, departmentName, downloadText } from '../operations/Shared';

export interface StudioProps { app: ReturnType<typeof useAtlas>; company: string; canWrite: boolean; notify: (text: string, error?: boolean) => void; openProcess: (p: Process) => void }
export function PageHeading({ label, title, children, action }: { label: string; title: string; children: ReactNode; action?: ReactNode }) { return <header className="studio-heading"><div><span className="studio-kicker">{label}</span><h1>{title}</h1><p>{children}</p></div>{action}</header>; }
export function Intro({ icon: Icon = Sparkles, title, children, action }: { icon?: any; title: string; children: ReactNode; action?: ReactNode }) { return <div className="studio-intro"><span className="studio-intro-icon"><Icon size={29} strokeWidth={1.4}/></span><h2>{title}</h2><p>{children}</p>{action}</div>; }
export function SourceList({ sources }: { sources: {id:string;title:string;quote:string;page?:number}[] }) { return <div className="studio-sources">{sources.map((s,i)=><details key={`${s.id}-${i}`}><summary><span>{String(i+1).padStart(2,'0')}</span>{s.title}{s.page&&<small>Pág. {s.page}</small>}</summary><blockquote>{s.quote}</blockquote></details>)}</div>; }
export function CompanyField({ value, set }: {value:Company;set:(v:Company)=>void}) { return <label className="field"><span className="field-label">Empresa</span><select value={value} onChange={e=>set(e.target.value as Company)}><option value="JTQ">Joyería Te Quiero</option><option value="TQM">Te Quiero Metales</option><option value="Ambas">Ambas empresas</option></select></label>; }
export function DepartmentField({ value, set }: {value:DepartmentId;set:(v:DepartmentId)=>void}) { return <label className="field"><span className="field-label">Departamento</span><select value={value} onChange={e=>set(e.target.value as DepartmentId)}>{DEPARTMENTS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>; }
export function useStudioWork(notify: StudioProps['notify']) {
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  async function run<T>(name:string,job:()=>Promise<T>,success?:string):Promise<T|undefined>{setBusy(name);setError('');try{const value=await job();if(success)notify(success);return value;}catch(e){setError(e instanceof Error?e.message:'No se pudo completar la acción.');return undefined;}finally{setBusy('');}}
  return {busy,error,setError,run};
}
export function BusyLabel({ busy, children }: {busy:boolean;children:ReactNode}) { return <>{busy?<Loader2 size={16} className="spin"/>:<Check size={16}/>} {children}</>; }
export function useUnsavedChanges(dirty:boolean) { useEffect(()=>{if(!dirty)return;const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[dirty]); }
export function EditorTop({ title, back, children }: {title:string;back:()=>void;children?:ReactNode}) { return <div className="studio-editor-top"><button className="text-button" onClick={back}><ChevronLeft size={17}/>Volver</button><span>{title}</span>{children}</div>; }
export function RecordList<T extends IntelligenceData>({ records, open, empty, detail }: {records:StudioRecord<T>[];open:(record:StudioRecord<T>)=>void;empty:ReactNode;detail:(record:StudioRecord<T>)=>ReactNode}) { return records.length?<div className="studio-record-list">{records.map(e=><button key={e.id} className="studio-record-row" onClick={()=>open(e)}><span className="studio-record-mark"><span>{e.name.slice(0,1).toLocaleUpperCase()}</span></span><span className="studio-record-copy"><strong>{e.name}</strong><small>{detail(e)}</small></span><ArrowRight size={18}/></button>)}</div>:<>{empty}</>; }
