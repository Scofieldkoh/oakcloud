/**
 * Scheduled Tasks Index
 *
 * Export all scheduled task registrations.
 * Import and register these with the scheduler in the main scheduler module.
 */

export { backupTask } from './backup.task';
export { cleanupTask } from './cleanup.task';
