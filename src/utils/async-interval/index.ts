import { logger } from '../logger';

/**
 * A class that implements an interval that waits for the previous execution to complete
 * before starting the next interval.
 */
export class AsyncInterval {
  private timeoutId: NodeJS.Timeout | null = null;
  private wakeUp: (() => void) | null = null;
  private isRunning = false;
  private shouldStop = false;

  /**
   * Creates an async interval that waits for the previous execution to complete
   * @param callback The async function to execute
   * @param intervalMs The interval in milliseconds between executions
   * @returns A function that stops the interval and resolves once the
   * in-flight execution (if any) has finished
   */
  static start(
    callback: () => Promise<void>,
    intervalMs: number
  ): () => Promise<void> {
    const instance = new AsyncInterval();
    const done = instance.run(callback, intervalMs);
    return () => {
      instance.stop();
      return done;
    };
  }

  private async run(
    callback: () => Promise<void>,
    intervalMs: number
  ): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.shouldStop = false;

    while (!this.shouldStop) {
      try {
        await callback();
      } catch (error) {
        logger.error('Error in async interval callback:', error);
      }

      if (this.shouldStop) {
        break;
      }

      await new Promise<void>((resolve) => {
        this.wakeUp = resolve;
        this.timeoutId = setTimeout(() => resolve(), intervalMs);
      });
    }

    this.isRunning = false;
    this.timeoutId = null;
    this.wakeUp = null;
  }

  private stop(): void {
    this.shouldStop = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    // Clearing the timer alone would leave run() awaiting forever.
    this.wakeUp?.();
  }
}
