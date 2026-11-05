'use client';
import { useState } from 'react';
import { navigateSafely } from './DraftGuard';
import dynamic from 'next/dynamic';
import { MessageSquare, ScanLine, Workflow, WandSparkles, SlidersHorizontal } from 'lucide-react';
import { PageHeading, type StudioProps } from './Shared';
const loading=()=> <div className="studio-skeleton" role="status" aria-label="Cargando módulo"><i/><i/><i/></div>;
const Interviews=dynamic(()=>import('./Interviews'),{loading});
const Findings=dynamic(()=>import('./Findings'),{loading});
const Mining=dynamic(()=>import('./Mining'),{loading});
const Blueprints=dynamic(()=>import('./Blueprints'),{loading});
const Simulator=dynamic(()=>import('./Simulator'),{loading});
export default function Studio(props:StudioProps & {mode:'discovery'|'design'}) {
  const [tab,setTab]=useState(props.mode==='discovery'?'interviews':'blueprints');
  const tabs=props.mode==='discovery'?[{id:'interviews',label:'Entrevistas',icon:MessageSquare},{id:'findings',label:'Hallazgos',icon:ScanLine},{id:'mining',label:'Actividad real',icon:Workflow}]:[{id:'blueprints',label:'Propuestas',icon:WandSparkles},{id:'simulator',label:'Simulador',icon:SlidersHorizontal}];
  const active=tabs.some(t=>t.id===tab)?tab:tabs[0].id;
  return <div className="studio view-enter"><PageHeading label={props.mode==='discovery'?'Comprender el trabajo':'Elegir el siguiente paso'} title={props.mode==='discovery'?'Descubrimiento':'Diseño de mejoras'}>{props.mode==='discovery'?'Une lo que las personas cuentan con lo que los datos muestran.':'Convierte una oportunidad en un plan que puedas revisar, probar y medir.'}</PageHeading><div className="studio-tabs" role="tablist" aria-label={props.mode==='discovery'?'Herramientas de descubrimiento':'Herramientas de diseño'}>{tabs.map((t,i)=><button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={active===t.id} aria-controls={`panel-${t.id}`} tabIndex={active===t.id?0:-1} onClick={()=>navigateSafely(()=>setTab(t.id))} onKeyDown={e=>{let index=-1;if(e.key==='ArrowRight')index=(i+1)%tabs.length;if(e.key==='ArrowLeft')index=(i+tabs.length-1)%tabs.length;if(e.key==='Home')index=0;if(e.key==='End')index=tabs.length-1;if(index>=0){e.preventDefault();navigateSafely(()=>{setTab(tabs[index].id);document.getElementById(`tab-${tabs[index].id}`)?.focus();});}}}><t.icon size={17}/>{t.label}</button>)}</div><section className="studio-tab-content" role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} key={active}>{active==='interviews'?<Interviews {...props}/>:active==='findings'?<Findings {...props}/>:active==='mining'?<Mining {...props}/>:active==='blueprints'?<Blueprints {...props}/>:<Simulator {...props}/>}</section></div>;
}
