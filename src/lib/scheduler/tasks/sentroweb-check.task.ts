import { createLogger } from '@/lib/logger';
import type { TaskRegistration, TaskResult } from '../types';

const log = createLogger('sentroweb-check-task');

/**
 * Every minute: runs whose lease expired become FAILED INTERRUPTED (never resumed, so no search
 * is submitted twice), and QUEUED runs the in-process start missed are picked up. A picked-up
 * run is not awaited: it can take minutes and the next tick must not wait for it.
 */
async function executeSentrowebCheckTask(): Promise<TaskResult> {
  try {
    const service = await import('../../../services/sentroweb/check.service');
    const { recovered } = await service.recoverStaleRuns();
    const { started } = await service.startStaleQueuedRuns();

    if (recovered.length > 0) log.warn('Interrupted Sentroweb runs recovered', { count: recovered.length });
    return {
      success: true,
      message: `Recovered ${recovered.length} interrupted and started ${started.length} queued Sentroweb run(s)`,
      data: { recovered: recovered.length, started: started.length },
    };
  } catch (error) {
    log.error('Sentroweb check task failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export const sentrowebCheckTask: TaskRegistration = {
  id: 'sentroweb-check',
  name: 'Sentroweb Check Recovery',
  description: 'Marks interrupted Sentroweb check runs as failed and starts queued runs that were missed',
  enabledEnvVar: 'SCHEDULER_ENABLED',
  defaultCronPattern: '* * * * *',
  execute: executeSentrowebCheckTask,
};
