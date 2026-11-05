'use client';

import { useId, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, FileText, Pencil, Plus, Download } from 'lucide-react';
import type { useAtlas } from '@/lib/store';
import type { AtlasState, Process, Session } from '@/lib/domain';
import { AUTOMATION_LABELS, documentsForSession, questionsForTask, taskGuide, type AutomationLevel, type JobDocument, type JobTask } from '@/lib/job-descriptions';
import { Action, Dialog, ErrorNote, Field, Tag, downloadText } from '../operations/Shared';

export type JobActions = Pick<ReturnType<typeof useAtlas>, 'addJobDocument' | 'saveJobMetadata' | 'saveJobTask' | 'createJobOpportunity' | 'downloadEvidence'>;
export interface TaskListProps {
  documents: JobDocument[]; state: AtlasState; actions: JobActions; canWrite: boolean;
  notify: (message: string, error?: boolean) => void; openProcess?: (process: Process) => void;
  sessionId?: string; filter?: AutomationLevel | 'all' | 'excluded'; person?: string; search?: string;
}
export function JobTaskList({ documents, state, actions, canWrite, notify, openProcess, sessionId, filter = 'all', person = '', search = '' }: TaskListProps) {
  const listId = useId();
  const [pageSize, setPageSize] = useState<5 | 10 | 'all'>(5);
  const [pagination, setPagination] = useState({ scope: '', page: 1 });
  const [editing, setEditing] = useState<{ document: JobDocument; task: JobTask; original?: string } | null>(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const rows = documents.flatMap(document => document.jobDescription.tasks.map(task => ({ document, task }))).filter(({ document, task }) =>
    (filter === 'excluded' ? task.excluded : !task.excluded && (filter === 'all' || task.automation === filter)) &&
    (!person || task.assignee === person || (!task.assignee && document.jobDescription.members.includes(person))) &&
    (!search || `${task.title} ${task.assignee} ${task.systems} ${document.jobDescription.role}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))));
  const scope = JSON.stringify([documents.map(d => d.id), filter, person, search, pageSize]);
  const pageCount = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const page = pagination.scope === scope ? Math.min(pagination.page, pageCount) : 1;
  const start = pageSize === 'all' ? 0 : (page - 1) * pageSize;
  const visibleRows = pageSize === 'all' ? rows : rows.slice(start, start + pageSize);
  const work = async (key: string, operation: () => Promise<unknown>, success: string) => {
    setBusy(key); setError('');
    try { await operation(); notify(success); return true; } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la tarea.'); return false; } finally { setBusy(''); }
  };
  const createTask = (document: JobDocument) => setEditing({ document, task: { id: crypto.randomUUID(), title: '', assignee: '', automation: 'pending', systems: '', notes: '', excluded: false, source: null, origin: 'added', updatedAt: new Date().toISOString() } });
  return <div className="job-task-workspace">
    <ErrorNote error={editing ? '' : error} />
    <div className="job-pagination-top"><span role="status">{rows.length ? `${start + 1}–${start + visibleRows.length} de ${rows.length} tareas` : '0 tareas'}</span><label htmlFor={`${listId}-page-size`}>Tareas por página<select id={`${listId}-page-size`} aria-label="Tareas por página" value={pageSize} onChange={e => { setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value) as 5 | 10); setPagination({ scope: '', page: 1 }); }}><option value="5">5</option><option value="10">10</option><option value="all">Todas</option></select></label></div>
    {!rows.length ? <div className="job-task-empty"><FileText size={22}/><p>No hay tareas con estos filtros.</p><span>Las funciones que añadas o extraigas del PDF aparecerán aquí para revisarlas.</span></div> :
      <div className="job-task-list">{visibleRows.map(({ document, task }) => {
        const opportunity = state.processes.find(p => p.jobTaskSource?.documentId === document.id && p.jobTaskSource.taskId === task.id);
        return <article className={`job-task ${task.excluded ? 'job-task-excluded' : ''}`} key={`${document.id}:${task.id}`}>
          <div className="job-task-main"><div className="job-task-origin"><span>{document.jobDescription.role}</span>{task.source ? <span>Pág. {task.source.page}</span> : <span>Añadida en revisión</span>}{task.excluded && <Tag>Descartada</Tag>}</div>
            <h3>{task.title}</h3><div className="job-task-person">{task.assignee || 'Persona por confirmar'}{task.systems && <span> · {task.systems}</span>}</div>
            {task.source && <details className="job-source"><summary>Ver fragmento del PDF</summary><blockquote>{task.source.quote}</blockquote></details>}
            {task.notes && <p className="job-task-notes">{task.notes}</p>}
          </div>
          <div className="job-task-controls"><label className="sr-only" htmlFor={`${listId}-status-${task.id}`}>Automatización de {task.title}</label><select id={`${listId}-status-${task.id}`} className={`job-status job-status-${task.automation}`} value={task.automation} disabled={!canWrite || !!busy || task.excluded || document.jobDescription.archived} onChange={event => {
            const automation = event.target.value as AutomationLevel;
            void work(task.id, () => actions.saveJobTask(document.id, { ...task, automation, ...(sessionId ? { reviewedIn: sessionId } : {}) }, task.updatedAt), 'Estado de la tarea guardado.');
          }}>{Object.entries(AUTOMATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {canWrite && !document.jobDescription.archived && <button className="text-button" disabled={!!busy} onClick={() => { setError(''); setEditing({ document, task: structuredClone(task), original: task.updatedAt }); }}><Pencil size={13}/> Revisar tarea</button>}
          {opportunity && openProcess ? <button className="text-button" onClick={() => openProcess(opportunity)}>Ver oportunidad <ArrowUpRight size={13}/></button> : openProcess && canWrite && !document.jobDescription.archived && !task.excluded && ['manual','partial'].includes(task.automation) && <button className="text-button" disabled={!!busy} onClick={() => void work(task.id, async () => { const p = await actions.createJobOpportunity(document.id, task.id); openProcess(p); }, 'Oportunidad creada con la tarea y su fuente.')}><Plus size={13}/> Crear oportunidad</button>}
          </div>
        </article>;
      })}</div>}
    {pageCount > 1 && <nav className="job-pagination" aria-label="Páginas de tareas"><button type="button" className="btn btn-secondary" disabled={page === 1} onClick={() => setPagination({ scope, page: page - 1 })}><ChevronLeft size={14}/> Anterior</button><span>Página {page} de {pageCount}</span><button type="button" className="btn btn-secondary" disabled={page === pageCount} onClick={() => setPagination({ scope, page: page + 1 })}>Siguiente <ChevronRight size={14}/></button></nav>}
    {canWrite && documents.length === 1 && !documents[0].jobDescription.archived && <button className="text-button job-add-task" disabled={!!busy} onClick={() => createTask(documents[0])}><Plus size={15}/> Añadir una tarea que falta</button>}
    {editing && <Dialog title={editing.original ? 'Revisar tarea' : 'Añadir tarea'} onClose={() => { if (!busy) { setEditing(null); setError(''); } }} busy={!!busy} error={error} submitLabel="Guardar tarea" onSubmit={async event => {
      event.preventDefault(); const saved = await work(editing.task.id, () => actions.saveJobTask(editing.document.id, { ...editing.task, title: editing.task.title.trim(), ...(sessionId ? { reviewedIn: sessionId } : {}) }, editing.original), 'Tarea guardada.'); if (saved) setEditing(null);
    }}>
      <Field label="Tarea"><textarea required maxLength={300} rows={3} value={editing.task.title} onChange={e => setEditing({ ...editing, task: { ...editing.task, title: e.target.value } })}/></Field>
      <div className="form-grid"><Field label="Persona que la realiza" hint="Puedes asignarla ahora o confirmarlo con el equipo."><input list="job-members" maxLength={180} value={editing.task.assignee} onChange={e => setEditing({ ...editing, task: { ...editing.task, assignee: e.target.value } })}/></Field>
      <Field label="Grado de automatización"><select value={editing.task.automation} onChange={e => setEditing({ ...editing, task: { ...editing.task, automation: e.target.value as AutomationLevel } })}>{Object.entries(AUTOMATION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field></div>
      <datalist id="job-members">{editing.document.jobDescription.members.map(m => <option key={m} value={m}/>)}</datalist>
      <Field label="Herramientas y sistemas"><input maxLength={1500} placeholder="Ej. Sage, Excel, correo…" value={editing.task.systems} onChange={e => setEditing({ ...editing, task: { ...editing.task, systems: e.target.value } })}/></Field>
      <Field label="Lo que confirma el equipo" hint="Describe qué pasos se hacen a mano, cuáles están automatizados y qué falta por comprobar."><textarea rows={4} maxLength={6000} value={editing.task.notes} onChange={e => setEditing({ ...editing, task: { ...editing.task, notes: e.target.value } })}/></Field>
      <label className="job-checkbox"><input type="checkbox" checked={editing.task.excluded} onChange={e => setEditing({ ...editing, task: { ...editing.task, excluded: e.target.checked } })}/> Esta tarea no corresponde al puesto. Conservar como descartada.</label>
      {editing.task.source && <div className="job-source-quote"><small>PDF · página {editing.task.source.page}</small><blockquote>{editing.task.source.quote}</blockquote></div>}
      <div className="job-questions"><strong>Para contrastar en la sesión</strong><ul>{questionsForTask(editing.task).map(q => <li key={q}>{q}</li>)}</ul></div>
    </Dialog>}
  </div>;
}

export default function SessionPreparation({ session, ...props }: Omit<TaskListProps, 'documents' | 'sessionId'> & { session: Session }) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState<AutomationLevel | 'all'>('all');
  const documents = documentsForSession(props.state.evidence, session), count = documents.reduce((n,d) => n + d.jobDescription.tasks.filter(t => !t.excluded).length, 0);
  const saved = props.state.sessions.some(s => s.id === session.id);
  return <div className="job-session-prep"><div className="job-session-head"><div><p className="eyebrow">PREPARACIÓN CON DOCUMENTOS</p><h3>{count ? `${count} tareas para contrastar` : 'Empieza por las descripciones de puesto'}</h3><p>Se muestran los puestos del departamento y empresa de esta sesión. Las clasificaciones y notas de tareas se guardan al instante.</p></div>{!!count && <Action secondary onClick={() => downloadText(taskGuide(documents, session.title), 'ATLAS_guion_de_tareas.md', 'text/markdown;charset=utf-8')}><Download size={14}/> Guion de tareas</Action>}</div>
    {!documents.length ? <p className="job-inline-note">Incorpora un PDF desde «Puestos y tareas». Sus tareas aparecerán aquí automáticamente al elegir el mismo departamento.</p> : <>
    {!saved && <p className="job-inline-note">Guarda primero la sesión para que sus revisiones queden vinculadas a ella.</p>}
    <div className="job-filters"><input aria-label="Buscar tareas de la sesión" placeholder="Buscar una tarea o persona…" value={search} onChange={e => setSearch(e.target.value)}/><select aria-label="Filtrar tareas de la sesión" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Todos los estados</option>{Object.entries(AUTOMATION_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
    <JobTaskList {...props} documents={documents} sessionId={saved ? session.id : undefined} canWrite={props.canWrite && saved} search={search} filter={filter}/></>}
  </div>;
}
