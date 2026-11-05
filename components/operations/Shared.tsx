'use client';

import { useEffect, useRef, useState, useId, isValidElement, cloneElement, type ReactElement, type ReactNode, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, X, ArrowUpRight, Loader2 } from 'lucide-react';
import { DEPARTMENTS, type AtlasState, type Process } from '@/lib/domain';
import { operationsOf, timestamp, uid, type ProcessOperations } from '@/lib/operations';

export interface WorkspaceProps { state: AtlasState; processes: Process[]; canWrite: boolean; actor: string; saveProcess: (p: Process) => Promise<void>; openProcess: (p: Process) => void; notify: (message: string, error?: boolean) => void }
export const fmt = (n: number | null, suffix = '') => n === null ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n) + suffix;
export const euro = (n: number | null) => n === null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
export const dateLabel = (value: string) => value ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha';
export const departmentName = (id: string) => DEPARTMENTS.find(d => d.id === id)?.name ?? id;
export function Action({ children, onClick, disabled = false, secondary = false, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; secondary?: boolean; type?: 'button' | 'submit' }) { return <button type={type} className={`btn btn-${secondary ? 'secondary' : 'primary'}`} disabled={disabled} onClick={onClick}>{children}</button>; }
export function Heading({ title, copy, action, label }: { title: string; copy: string; action?: ReactNode; label: string }) { return <div className="section-head ops-heading"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p className="section-description">{copy}</p></div>{action && <div className="button-row">{action}</div>}</div>; }
export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) { return <div className="ops-stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <div className="ops-empty"><div className="ops-empty-mark"><Plus size={23}/></div><h3>{title}</h3><p>{children}</p>{action}</div>; }
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id=useId(); const control=isValidElement(children)&&typeof children.type==='string'&&['input','select','textarea'].includes(children.type);
  return <div className="field" role={control?undefined:'group'} aria-label={control?undefined:label}>{control?<label className="field-label" htmlFor={id}>{label}</label>:<span className="field-label">{label}</span>}{control?cloneElement(children as ReactElement<{id?:string;'aria-describedby'?:string}>,{id,'aria-describedby':hint?`${id}-hint`:undefined}):children}{hint&&<span id={`${id}-hint`} className="field-hint">{hint}</span>}</div>;
}
export function Numeric({ label, value, set, max, step = 'any', hint }: { label: string; value: number; set: (v: number) => void; max?: number; step?: string; hint?: string }) { return <Field label={label} hint={hint}><input type="number" min="0" max={max} step={step} required value={value} onChange={e => set(e.target.value === '' ? 0 : Number(e.target.value))}/></Field>; }
export function SelectProcess({ processes, value, set, open }: { processes: Process[]; value: string; set: (id: string) => void; open?: () => void }) { return <div className="ops-selector"><Field label="Proceso"><select value={value} onChange={e => set(e.target.value)}>{processes.map(p => <option key={p.id} value={p.id}>{p.name} · {departmentName(p.departmentId)}</option>)}</select></Field>{open && <button className="text-button" onClick={open}>Abrir ficha <ArrowUpRight size={15}/></button>}</div>; }
export function useSelectedProcess(processes: Process[]) { const [id, setId] = useState(''); return [processes.find(p => p.id === id) ?? processes[0], setId] as const; }
export function useWork(props: WorkspaceProps) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async (job: () => Promise<void>, success?: string) => { setBusy(true); setError(''); try { await job(); if (success) props.notify(success); return true; } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); return false; } finally { setBusy(false); } };
  const save = (p: Process, operations: ProcessOperations, text: string) => run(() => props.saveProcess({ ...p, operations: { ...operations, activity: [{ id: uid(), author: props.actor, text, at: timestamp() }, ...operationsOf(p).activity].slice(0, 500) } }), text);
  return { busy, error, setError, run, save };
}
export function ErrorNote({ error }: { error: string }) { return error ? <p role="alert" className="ops-error">{error}</p> : null; }
export function Dialog({ title, children, onClose, onSubmit, busy, error, submitLabel = 'Guardar cambios', recordVersion }: { title: string; children: ReactNode; onClose: () => void; onSubmit: (e: FormEvent) => void; busy: boolean; error?: string; submitLabel?: string; recordVersion?: string }) {
  const ref = useRef<HTMLDivElement>(null), closeRef = useRef(onClose); closeRef.current = onClose;
  const originalVersion = useRef(recordVersion), [conflict,setConflict] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement, overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    (ref.current?.querySelector<HTMLElement>('input,select,textarea') ?? ref.current?.querySelector<HTMLElement>('button'))?.focus();
    const key = (e: KeyboardEvent) => { if ([...document.querySelectorAll('[role="dialog"]')].at(-1) !== ref.current) return; if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeRef.current(); return; } if (e.key !== 'Tab') return; e.stopPropagation(); const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'); if (!nodes?.length) return; const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="modal-scrim"><div ref={ref} className="modal ops-dialog" role="dialog" aria-modal="true" aria-label={title}><header className="modal-head"><div><p className="eyebrow">ATLAS / OPERACIONES</p><h2>{title}</h2></div><button className="icon-btn" type="button" aria-label="Cerrar" disabled={busy} onClick={onClose}><X size={20}/></button></header><form onSubmit={e=>{if(recordVersion!==originalVersion.current){e.preventDefault();setConflict(true);return;}onSubmit(e);}}><fieldset disabled={busy} className="ops-fields">{children}</fieldset><div className="ops-dialog-footer"><ErrorNote error={conflict?'Este registro cambió mientras lo editabas. Cierra este formulario y vuelve a abrirlo para revisar los datos actuales.':error ?? ''}/><div className="button-row"><Action secondary disabled={busy} onClick={onClose}>Cancelar</Action><Action type="submit" disabled={busy||conflict}>{busy ? <Loader2 className="spin" size={16}/> : <Check size={16}/>} {submitLabel}</Action></div></div></form></div></div>, document.body);
}
export function downloadText(text: string, filename: string, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
