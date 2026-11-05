const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validateIntelligence(value: unknown): string[] {
  if (value === undefined) return [];
  const errors: string[] = [];
  if (!object(value)) return ['El registro de inteligencia no es válido.'];
  const text = (v: unknown, max = 12000) => typeof v === 'string' && v.length <= max;
  const date = (v: unknown) => text(v, 60) && Number.isFinite(Date.parse(v as string));
  const number = (v: unknown, max = 1e9, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const optionalNumber = (v: unknown, max = 1e9) => v === null || number(v, max);
  const list = (v: unknown, max: number, fn: (x: any) => boolean) => Array.isArray(v) && v.length <= max && v.every(fn);
  const strings = (v: unknown, max = 100) => list(v, max, x => text(x, 12000));
  const sources = (v: unknown) => list(v, 100, s => object(s) && text(s.id, 100) && text(s.title, 300) && text(s.quote, 10000) && (s.page === undefined || number(s.page, 10000, 1)));
  if (value.version !== 1 || !date(value.updatedAt)) errors.push('La versión o fecha del registro no es válida.');
  if ('company' in value && !['JTQ', 'TQM', 'Ambas'].includes(value.company)) errors.push('La empresa del registro no es válida.');
  if (['interview','event-log','knowledge'].includes(value.kind) && !['JTQ','TQM','Ambas'].includes(value.company)) errors.push('Selecciona la empresa del registro.');
  let valid = false;
  switch (value.kind) {
    case 'interview':
      valid = text(value.person, 200) && text(value.role, 300) && text(value.task, 1000) && sources(value.sources) && ['draft','in-progress','submitted','reviewed'].includes(value.status) && ['pending','manual','partial','automated'].includes(value.automation) && text(value.systems, 2000) && text(value.exceptions) && typeof value.confirmed === 'boolean' && optionalNumber(value.frequency) && optionalNumber(value.minutes, 100000) && list(value.turns, 30, t => object(t) && text(t.id, 100) && text(t.question, 2000) && text(t.answer, 6000) && date(t.at) && ['guide','ai'].includes(t.source));
      if (value.frequency !== null && !Number.isInteger(value.frequency)) valid = false;
      if (value.pendingQuestion !== undefined && (!object(value.pendingQuestion) || !text(value.pendingQuestion.text, 2000) || !['guide','ai'].includes(value.pendingQuestion.source))) valid = false;
      if (value.processId !== undefined && !text(value.processId, 100)) valid = false;
      if (value.status === 'reviewed' && !value.confirmed) valid = false;
      if (value.share && (!object(value.share) || !/^[a-f0-9]{64}$/.test(value.share.hash) || !date(value.share.expiresAt) || typeof value.share.revoked !== 'boolean')) valid = false;
      break;
    case 'finding': valid = text(value.key, 500) && ['pending','confirmed','dismissed'].includes(value.status) && text(value.note) && text(value.reviewer, 200) && sources(value.sources) && (value.status === 'pending' || !!value.note.trim()); break;
    case 'event-log':
      valid = text(value.sourceName, 300) && text(value.terminalActivity, 200) && number(value.duplicates, 100000) && date(value.importedAt) && list(value.events, 3000, e => object(e) && text(e.id, 250) && text(e.caseId, 200) && !!e.caseId && text(e.activity, 200) && !!e.activity && date(e.at) && text(e.resource, 200) && optionalNumber(e.activeMinutes, 100000) && optionalNumber(e.cost));
      if (Array.isArray(value.events) && value.events.every(object)) {
        if (new Set(value.events.map(e => e.id)).size !== value.events.length) valid = false;
        if (value.terminalActivity && !value.events.some(e => e.activity === value.terminalActivity)) valid = false;
      }
      break;
    case 'blueprint':
      valid = text(value.processId, 100) && date(value.processVersion) && text(value.objective) && text(value.approach) && strings(value.requirements) && strings(value.risks) && ['draft','approved','implemented'].includes(value.status) && ['rules','ai'].includes(value.source) && text(value.aiText, 24000) && text(value.approvedBy, 200) && optionalNumber(value.implementationBudget) && optionalNumber(value.monthlyBudget) && text(value.targetUrl, 2000) && list(value.steps, 40, s => object(s) && text(s.id, 100) && text(s.title, 300) && text(s.detail) && text(s.acceptance) && strings(s.dependsOn, 40) && typeof s.checked === 'boolean');
      if (Array.isArray(value.steps) && value.steps.every(object)) {
        const ids = new Set(value.steps.map((s: any) => s.id));
        if (!ids.size || ids.size !== value.steps.length || value.steps.some((s: any) => !Array.isArray(s.dependsOn) || s.dependsOn.some((d: any) => !ids.has(d) || d === s.id))) valid = false;
        const visits = new Map<string, number>();
        const visit = (id: string): boolean => { if (visits.get(id) === 1) return false; if (visits.get(id) === 2) return true; visits.set(id, 1); const step = value.steps.find((s: any) => s.id === id); if (!step || !Array.isArray(step.dependsOn) || !step.dependsOn.every(visit)) return false; visits.set(id, 2); return true; };
        if (![...ids].every(id => typeof id === 'string' && visit(id))) valid = false;
      }
      if (value.status !== 'draft' && (typeof value.approvedBy !== 'string' || !value.approvedBy.trim() || !Array.isArray(value.steps) || !value.steps.every((s: any) => object(s) && s.checked && typeof s.acceptance === 'string' && s.acceptance.trim()))) valid = false;
      break;
    case 'scenario': valid = number(value.budget) && number(value.growthPct, 500, -100) && number(value.adoptionPct, 100) && number(value.capacityHours, 1e6) && strings(value.processIds, 100) && ['hours','cash'].includes(value.objective) && text(value.assumption) && list(value.dependencies, 100, d => object(d) && text(d.processId, 100) && strings(d.requires, 100)); break;
    case 'knowledge':
      valid = text(value.owner, 200) && ['draft','published','archived'].includes(value.status) && text(value.content, 120000) && sources(value.sources) && text(value.reviewDate, 30) && (!value.reviewDate || /^\d{4}-\d{2}-\d{2}$/.test(value.reviewDate)) && list(value.versions, 20, v => object(v) && number(v.number, 10000, 1) && text(v.content, 120000) && date(v.at) && text(v.author, 200) && text(v.source, 500) && (v.sources === undefined || sources(v.sources)));
      if (value.status === 'published' && (typeof value.owner !== 'string' || !value.owner.trim() || typeof value.content !== 'string' || !value.content.trim() || !Array.isArray(value.sources) || !value.sources.length || value.sources.some((s: any) => !object(s) || typeof s.title !== 'string' || !s.title.trim()))) valid = false;
      if (Array.isArray(value.versions)) {
        if (value.versions.some((v: any,i: number) => !object(v) || !Number.isInteger(v.number) || (i > 0 && v.number <= value.versions[i-1]?.number))) valid = false;
        if (value.status === 'published' && value.versions.at(-1)?.content !== value.content) valid = false;
      }
      break;
    case 'monitor': valid = typeof value.enabled === 'boolean' && (value.lastCheckedAt === '' || date(value.lastCheckedAt)) && ['in-app','webhook'].includes(value.delivery) && list(value.alerts, 500, a => object(a) && text(a.key, 300) && text(a.processId, 100) && text(a.automationId, 100) && text(a.title, 500) && date(a.detectedAt) && (!a.resolvedAt || date(a.resolvedAt)) && (!a.acknowledgedAt || date(a.acknowledgedAt)) && (!a.notifiedAt || date(a.notifiedAt))) && (!value.lastServerCheckAt || date(value.lastServerCheckAt)) && (value.notificationError === undefined || text(value.notificationError, 1000)); break;
  }
  if (!valid) errors.push(`Revisa los campos del registro ${text(value.kind, 30) ? value.kind : 'de inteligencia'}.`);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 850000) errors.push('El registro supera el límite de 850 KB. Divide la información en varios documentos.');
  return errors;
}
