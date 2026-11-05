import type { Company, DepartmentId, Evidence } from '../domain';

export interface SourceRef { id: string; title: string; quote: string; page?: number }
export interface InterviewTurn { id: string; question: string; answer: string; at: string; source: 'guide' | 'ai' }
export interface InterviewData {
  kind: 'interview'; version: 1; updatedAt: string; company: Company; person: string; role: string;
  task: string; sources: SourceRef[]; turns: InterviewTurn[]; status: 'draft' | 'in-progress' | 'submitted' | 'reviewed';
  automation: 'pending' | 'manual' | 'partial' | 'automated'; systems: string;
  frequency: number | null; minutes: number | null; exceptions: string; confirmed: boolean; processId?: string;
  share?: { hash: string; expiresAt: string; revoked: boolean };
  pendingQuestion?: { text: string; source: 'guide' | 'ai' };
}
export interface FindingData {
  kind: 'finding'; version: 1; updatedAt: string; key: string; status: 'pending' | 'confirmed' | 'dismissed';
  note: string; reviewer: string; sources: SourceRef[]; processId?: string;
}
export interface ProcessEvent { id: string; caseId: string; activity: string; at: string; resource: string; activeMinutes: number | null; cost: number | null }
export interface EventLogData {
  kind: 'event-log'; version: 1; updatedAt: string; company: Company; sourceName: string;
  events: ProcessEvent[]; terminalActivity: string; duplicates: number; importedAt: string;
}
export interface BlueprintStep { id: string; title: string; detail: string; acceptance: string; dependsOn: string[]; checked: boolean }
export interface BlueprintData {
  kind: 'blueprint'; version: 1; updatedAt: string; processId: string; processVersion: string;
  objective: string; approach: string; steps: BlueprintStep[]; requirements: string[]; risks: string[];
  status: 'draft' | 'approved' | 'implemented'; source: 'rules' | 'ai'; aiText: string; approvedBy: string;
  implementationBudget: number | null; monthlyBudget: number | null; targetUrl: string;
}
export interface ScenarioData {
  kind: 'scenario'; version: 1; updatedAt: string; budget: number; growthPct: number; adoptionPct: number;
  capacityHours: number; processIds: string[]; dependencies: { processId: string; requires: string[] }[];
  objective: 'hours' | 'cash'; assumption: string;
}
export interface KnowledgeVersion { number: number; content: string; at: string; author: string; source: string; sources?: SourceRef[] }
export interface KnowledgeData {
  kind: 'knowledge'; version: 1; updatedAt: string; company: Company; owner: string; status: 'draft' | 'published' | 'archived';
  content: string; sources: SourceRef[]; versions: KnowledgeVersion[]; reviewDate: string;
}
export interface MonitorAlert { key: string; processId: string; automationId: string; title: string; detectedAt: string; resolvedAt: string; acknowledgedAt: string; notifiedAt?: string }
export interface MonitorData {
  kind: 'monitor'; version: 1; updatedAt: string; enabled: boolean; lastCheckedAt: string;
  alerts: MonitorAlert[]; delivery: 'in-app' | 'webhook';
  lastServerCheckAt?: string; notificationError?: string;
}
export type IntelligenceData = InterviewData | FindingData | EventLogData | BlueprintData | ScenarioData | KnowledgeData | MonitorData;
export type IntelligenceKind = IntelligenceData['kind'];
export type StudioRecord<T extends IntelligenceData = IntelligenceData> = Evidence & { departmentId: DepartmentId; intelligence: T };
export const stamp = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export function studioRecord<T extends IntelligenceData>(name: string, departmentId: DepartmentId, intelligence: T): StudioRecord<T> {
  return { id: id(), name, departmentId, type: intelligence.kind === 'interview' ? 'interview' : intelligence.kind === 'event-log' ? 'data' : 'document', description: '', source: 'ATLAS · Inteligencia operativa', createdAt: stamp(), anonymized: false, validated: false, intelligence };
}
export function recordsOf<K extends IntelligenceKind>(evidence: Evidence[], kind: K): StudioRecord<Extract<IntelligenceData, { kind: K }>>[] {
  return evidence.filter(e => e.intelligence?.kind === kind) as StudioRecord<Extract<IntelligenceData, { kind: K }>>[];
}
export function belongsToCompany(record: Evidence, company: string) {
  const data = record.intelligence;
  return company === 'all' || !data || !('company' in data) || data.company === company || data.company === 'Ambas';
}
