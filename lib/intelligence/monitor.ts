import type { Process } from '../domain';
import { calculateAlerts } from '../../supabase/functions/_shared/monitoring';
import type { MonitorAlert } from './types';
export function monitorAlerts(processes:Process[],previous:MonitorAlert[],now=new Date()):MonitorAlert[]{
  return calculateAlerts(processes,previous,now);
}
