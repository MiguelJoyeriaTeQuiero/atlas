'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { DEPARTMENTS, type Session } from '@/lib/domain';

const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T12:00:00Z`);
const todayKey = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const formatDate = (value: string, options: Intl.DateTimeFormatOptions) =>
  asDate(value).toLocaleDateString('es-ES', { ...options, timeZone: 'UTC' });

type Props = {
  sessions: Session[];
  canWrite: boolean;
  onOpen: (session: Session) => void;
  onCreate: (date: string) => void;
};

export default function SessionCalendar({ sessions, canWrite, onOpen, onCreate }: Props) {
  const [selected, setSelected] = useState(todayKey);
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [mode, setMode] = useState<'month' | 'list'>('month');
  const [department, setDepartment] = useState('all');
  const today = todayKey();
  const filtered = useMemo(() => sessions
    .filter(session => department === 'all' || session.departmentId === department)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)), [sessions, department]);
  const byDate = useMemo(() => {
    const grouped = new Map<string, Session[]>();
    for (const session of filtered) grouped.set(session.date, [...(grouped.get(session.date) || []), session]);
    return grouped;
  }, [filtered]);
  const monthSessions = filtered.filter(session => session.date.startsWith(month));
  const selectedSessions = byDate.get(selected) || [];
  const start = asDate(`${month}-01`);
  const offset = (start.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const days = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) =>
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), index - offset + 1, 12)));

  function moveMonth(delta: number) {
    const next = dayKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1, 12)));
    setMonth(next.slice(0, 7));
    setSelected(next);
  }
  function selectDay(key: string) { setSelected(key); setMonth(key.slice(0, 7)); }

  return <section className="calendar-workspace" aria-label="Agenda de sesiones">
    <div className="calendar-toolbar">
      <div className="calendar-month-title" aria-live="polite">
        <h2>{formatDate(`${month}-01`, { month: 'long' })} <span>{start.getUTCFullYear()}</span></h2>
        <p>{monthSessions.length} {monthSessions.length === 1 ? 'sesión este mes' : 'sesiones este mes'}</p>
      </div>
      <div className="calendar-controls">
        <div className="segmented-control" aria-label="Vista de la agenda">
          <button aria-pressed={mode === 'month'} onClick={() => setMode('month')}><CalendarDays size={15} />Mes</button>
          <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}><List size={15} />Lista</button>
        </div>
        <div className="calendar-pagination">
          <button className="icon-btn" aria-label="Mes anterior" onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button>
          <button className="calendar-today" onClick={() => selectDay(today)}>Hoy</button>
          <button className="icon-btn" aria-label="Mes siguiente" onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
        </div>
      </div>
    </div>
    <div className="calendar-body">
      <div className="calendar-main">
        {mode === 'month' ? <>
          <div className="calendar-weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {days.map(day => {
              const key = dayKey(day);
              const items = byDate.get(key) || [];
              return <div key={key} className={`calendar-day ${key.startsWith(month) ? '' : 'outside-month'} ${key === selected ? 'selected-day' : ''} ${[0, 6].includes(day.getUTCDay()) ? 'weekend' : ''}`}>
                <button className={`calendar-day-number ${key === today ? 'is-today' : ''}`} aria-pressed={key === selected}
                  aria-label={`${formatDate(key, { day: 'numeric', month: 'long', year: 'numeric' })}, ${items.length} sesiones`}
                  aria-current={key === today ? 'date' : undefined} onClick={() => selectDay(key)}>
                  {day.getUTCDate()}
                </button>
                <div className="calendar-day-events">{items.slice(0, 3).map(session =>
                  <button key={session.id} className={`calendar-event company-${session.company}`} onClick={() => onOpen(session)} title={session.title}>
                    {session.status === 'completed' && <Check size={11} />}<span>{session.title || 'Sesión sin título'}</span>
                  </button>)}{items.length > 3 && <button className="calendar-more" onClick={() => selectDay(key)}>+{items.length - 3} más</button>}</div>
                {items.length > 0 && <span className="calendar-mobile-dot" aria-hidden="true" />}
              </div>;
            })}
          </div>
          <div className="calendar-legend"><span><i className="company-dot jtq" />Joyería Te Quiero</span><span><i className="company-dot tqm" />Te Quiero Metales</span><span><i className="company-dot both" />Ambas</span></div>
        </> : <div className="calendar-agenda-list">
          {monthSessions.length ? monthSessions.map(session => <button className="agenda-row" key={session.id} onClick={() => onOpen(session)}>
            <span className="agenda-date"><strong>{asDate(session.date).getUTCDate()}</strong><small>{formatDate(session.date, { weekday: 'short' })}</small></span>
            <span className={`agenda-marker company-${session.company}`} />
            <span className="agenda-row-title"><strong>{session.title || 'Sesión sin título'}</strong><small>{DEPARTMENTS.find(d => d.id === session.departmentId)?.name} · {session.company}</small></span>
            <span className={`badge ${session.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>{session.status === 'completed' ? 'Completada' : 'Programada'}</span>
            <ChevronRight size={16} />
          </button>) : <div className="calendar-empty"><CalendarDays size={30} strokeWidth={1.3} /><h3>Un mes por organizar</h3><p>No hay sesiones en {formatDate(`${month}-01`, { month: 'long' })}{department !== 'all' ? ' para este departamento' : ''}.</p>{canWrite && <button className="text-button" onClick={() => onCreate(selected)}><Plus size={15} />Programar una sesión</button>}</div>}
        </div>}
      </div>
      <aside className="calendar-inspector" aria-label="Detalle del día">
        <label className="calendar-filter">Departamento<select value={department} onChange={e => setDepartment(e.target.value)} aria-label="Filtrar sesiones por departamento"><option value="all">Todos los departamentos</option>{DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <div className="inspector-date"><span>{formatDate(selected, { weekday: 'long' })}</span><strong>{asDate(selected).getUTCDate()}</strong><p>{formatDate(selected, { month: 'long', year: 'numeric' })}</p></div>
        <div className="inspector-heading"><h3>Sesiones del día</h3><span>{selectedSessions.length}</span></div>
        {selectedSessions.length ? <div className="inspector-sessions">{selectedSessions.map(session => <button key={session.id} className={`inspector-session company-${session.company}`} onClick={() => onOpen(session)}><span>{session.company} · {session.status === 'completed' ? 'Completada' : 'Programada'}</span><strong>{session.title || 'Sesión sin título'}</strong><small>{session.owner || 'Responsable por definir'}</small></button>)}</div> : <div className="inspector-empty"><CalendarDays size={23} strokeWidth={1.3} /><p>Sin sesiones programadas</p><span>Un espacio para la próxima conversación.</span></div>}
        {canWrite && <button className="btn btn-secondary inspector-add" onClick={() => onCreate(selected)}><Plus size={16} />Añadir sesión</button>}
      </aside>
    </div>
  </section>;
}
