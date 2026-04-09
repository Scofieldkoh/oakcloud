import { createLogger } from '@/lib/logger';
import type { TaskRegistration, TaskResult } from '../types';

const log = createLogger('esigning-pdf-generation-task');

let esigningPdfServiceInstance: typeof import('@/services/esigning-pdf.service') | null = null;

async function getEsigningPdfService(): Promise<typeof import('@/services/esigning-pdf.service')> {
  if (!esigningPdfServiceInstance) {
    esigningPdfServiceInstance = await import('../../../services/esigning-pdf.service');
  }

  return esigningPdfServiceInstance;
}

async function executeEsigningPdfGenerationTask(): Promise<TaskResult> {
  log.info('Processing queued e-signing PDF generation jobs...');

  try {
    const service = await getEsigningPdfService();
    const result = await service.processQueuedEsigningPdfGeneration({ limit: 5 });

    return {
      success: true,
      message: `Processed ${result.processed} e-signing PDF job(s)`,
      data: result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to process queued e-signing PDF generation jobs', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export const esigningPdfGenerationTask: TaskRegistration = {
  id: 'esigning-pdf-generation',
  name: 'E-Signing PDF Generation Queue',
  description: 'Processes completed envelopes and generates signed PDF artifacts',
  defaultCronPattern: '*/1 * * * *',
  execute: executeEsigningPdfGenerationTask,
};
