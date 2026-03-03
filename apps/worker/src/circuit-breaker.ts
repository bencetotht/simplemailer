interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failuresInWindow: number;
  windowStartMs: number;
  openedAtMs?: number;
  halfOpenProbes: number;
  consecutiveSuccesses: number;
}

interface CircuitConfig {
  failureThreshold: number;
  windowMs: number;
  openDurationMs: number;
  halfOpenProbeLimit: number;
  successThresholdToClose: number;
}

export class CircuitBreaker {
  private readonly stateByKey = new Map<string, CircuitState>();
  private readonly config: CircuitConfig;

  constructor(config?: Partial<CircuitConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      windowMs: config?.windowMs ?? 60_000,
      openDurationMs: config?.openDurationMs ?? 30_000,
      halfOpenProbeLimit: config?.halfOpenProbeLimit ?? 2,
      successThresholdToClose: config?.successThresholdToClose ?? 3,
    };
  }

  private getOrInit(key: string): CircuitState {
    const existing = this.stateByKey.get(key);
    if (existing) return existing;
    const state: CircuitState = {
      state: 'CLOSED',
      failuresInWindow: 0,
      windowStartMs: Date.now(),
      halfOpenProbes: 0,
      consecutiveSuccesses: 0,
    };
    this.stateByKey.set(key, state);
    return state;
  }

  canAttempt(key: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const state = this.getOrInit(key);

    if (state.state === 'OPEN') {
      const openedAt = state.openedAtMs ?? now;
      if (now - openedAt >= this.config.openDurationMs) {
        state.state = 'HALF_OPEN';
        state.halfOpenProbes = 0;
        state.consecutiveSuccesses = 0;
      } else {
        return { allowed: false, reason: 'circuit-open' };
      }
    }

    if (state.state === 'HALF_OPEN') {
      if (state.halfOpenProbes >= this.config.halfOpenProbeLimit) {
        return { allowed: false, reason: 'circuit-half-open-probe-limit' };
      }
      state.halfOpenProbes += 1;
    }

    return { allowed: true };
  }

  recordSuccess(key: string): void {
    const state = this.getOrInit(key);
    if (state.state === 'HALF_OPEN') {
      state.consecutiveSuccesses += 1;
      if (state.consecutiveSuccesses >= this.config.successThresholdToClose) {
        this.stateByKey.set(key, {
          state: 'CLOSED',
          failuresInWindow: 0,
          windowStartMs: Date.now(),
          halfOpenProbes: 0,
          consecutiveSuccesses: 0,
        });
      }
      return;
    }

    if (state.state === 'CLOSED') {
      state.failuresInWindow = 0;
      state.windowStartMs = Date.now();
    }
  }

  recordRetryableFailure(key: string): void {
    const now = Date.now();
    const state = this.getOrInit(key);

    if (state.state === 'HALF_OPEN') {
      state.state = 'OPEN';
      state.openedAtMs = now;
      state.halfOpenProbes = 0;
      state.consecutiveSuccesses = 0;
      return;
    }

    if (now - state.windowStartMs > this.config.windowMs) {
      state.windowStartMs = now;
      state.failuresInWindow = 0;
    }

    state.failuresInWindow += 1;
    if (state.failuresInWindow >= this.config.failureThreshold) {
      state.state = 'OPEN';
      state.openedAtMs = now;
      state.halfOpenProbes = 0;
      state.consecutiveSuccesses = 0;
    }
  }

  getOpenCircuits(): number {
    let count = 0;
    for (const state of this.stateByKey.values()) {
      if (state.state === 'OPEN') count += 1;
    }
    return count;
  }
}
