'use client';
import { useEffect, useState } from 'react';
import { Action, Dialog } from '../operations/Shared';

export function navigateSafely(action:()=>void,cancel?:()=>void){
  const event=new CustomEvent('atlas:before-navigate',{cancelable:true,detail:{proceed:action,cancel}});
  if(window.dispatchEvent(event))action();
}
export function useDraftGuard(dirty:boolean){
  const [pending,setPending]=useState<{action:()=>void;cancel?:()=>void}|null>(null);
  useEffect(()=>{
    if(!dirty)return;
    const before=(event:Event)=>{event.preventDefault();setPending({action:(event as CustomEvent).detail.proceed,cancel:(event as CustomEvent).detail.cancel});};
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('atlas:before-navigate',before);window.addEventListener('beforeunload',unload);
    return()=>{window.removeEventListener('atlas:before-navigate',before);window.removeEventListener('beforeunload',unload);};
  },[dirty]);
  const keepEditing=()=>{pending?.cancel?.();setPending(null);};
  return pending?<Dialog title="Tienes cambios sin guardar" busy={false} onClose={keepEditing} onSubmit={e=>{e.preventDefault();keepEditing();}} footer={<div className="button-row"><Action secondary onClick={()=>{const action=pending.action;setPending(null);action();}}>Salir sin guardar</Action><Action type="submit">Seguir editando</Action></div>}><p className="studio-prose">Puedes volver al documento para guardar tus cambios o salir y conservar la última versión guardada.</p></Dialog>:null;
}
