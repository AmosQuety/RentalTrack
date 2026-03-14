/**
 * Exponential Backoff execution strategy to prevent hammering network APIs.
 */
export class RetryStrategy {
  /**
   * Executes a given async task applying exponential backoff upon failure.
   * delay(n) = baseDelayMs * (2 ^ n)
   * 
   * @param task Function to execute
   * @param maxAttempts Maximum times to attempt the task before throwing (Default: 5)
   * @param baseDelayMs Initial millisecond delay base (Default: 1000ms)
   */
  static async execute<T>(
    task: () => Promise<T>, 
    maxAttempts: number = 5, 
    baseDelayMs: number = 1000
  ): Promise<T> {
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        return await task();
      } catch (error) {
        attempt++;
        
        if (attempt >= maxAttempts) {
          console.error(`[RetryStrategy] Task failed after ${maxAttempts} attempts.`);
          throw error;
        }

        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[RetryStrategy] Attempt ${attempt} failed. Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Should never reach here due to the throw in loop, but satisfies TS.
    throw new Error('Unreachable exception in RetryStrategy');
  }
}
