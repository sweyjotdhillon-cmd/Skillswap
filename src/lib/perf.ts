import { logger } from './logger';

const IS_DEV = typeof process !== 'undefined'
  ? process.env.NODE_ENV !== 'production'
  : (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? true;

/**
 * Logs performance timing information for mutation operations.
 * Format: [PERF] <action> <phase> <durationMs>ms
 */
export function perfLog(action: string, phase: string, startTimeOrDurationMs: number): void {
  if (!IS_DEV) return;

  const durationMs = startTimeOrDurationMs > 1000000000000 || startTimeOrDurationMs < 0
    ? Math.round(performance.now() - startTimeOrDurationMs)
    : Math.round(startTimeOrDurationMs);

  logger.info(`[PERF] ${action} ${phase} ${durationMs}ms`);
}

/**
 * Helper class to track timing across mutation boundaries (start -> rpc -> ui_commit -> reconcile).
 */
export class PerfTracker {
  private action: string;
  private startTime: number;

  constructor(action: string) {
    this.action = action;
    this.startTime = performance.now();
    perfLog(this.action, 'start', 0);
  }

  logPhase(phase: string): number {
    const elapsed = performance.now() - this.startTime;
    perfLog(this.action, phase, elapsed);
    return elapsed;
  }
}
