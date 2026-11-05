'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
const AtlasApp=dynamic(()=>import('./AtlasApp'));
const PublicInterview=dynamic(()=>import('./intelligence/PublicInterview'));
export default function AppEntry(){
  const [route,setRoute]=useState<{token:string;project:string}|false|null>(null);
  useEffect(()=>{const p=new URLSearchParams(location.hash.slice(1));setRoute(p.has('interview')?{token:p.get('interview')??'',project:p.get('project')??''}:false);},[]);
  if(route===null)return <div className="app-loading"><strong>ATLAS</strong><p>Preparando tu espacio de trabajo</p></div>;
  return route?<PublicInterview token={route.token} project={route.project}/>:<AtlasApp/>;
}
