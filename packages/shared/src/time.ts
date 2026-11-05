export type EpochValue = number | string | null | undefined;

/** Accept Unix epoch seconds or milliseconds, including numeric strings. */
export function normalizeEpoch(value: EpochValue): number | undefined {
  if (typeof value === 'string' && !value.trim()) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  const milliseconds = parsed >= 1_000_000_000 && parsed < 100_000_000_000 ? parsed * 1000 : parsed;
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

export interface ClockDiagnostic { reason: string; raw?: number; wallDelta?: number }
export interface SafeMonotonicOptions {
  wall?: () => number;
  debug?: boolean;
  diagnose?: (event: ClockDiagnostic) => void;
  maxForwardMs?: number;
}

/**
 * Converts unreliable platform performance clocks into a continuous elapsed-ms clock.
 * It accepts ms/seconds/microseconds and falls back to wall deltas on invalid samples.
 */
export class SafeMonotonic {
  private lastRaw?: number;
  private lastWall: number;
  private elapsedMs = 0;
  private scale?: number;
  private diagnosticsAt = new Map<string, number>();
  private readonly wall: () => number;
  private readonly debug: boolean;
  private readonly diagnose?: (event: ClockDiagnostic) => void;
  private readonly maxForwardMs: number;

  constructor(private readonly raw: () => number, options: SafeMonotonicOptions = {}) {
    this.wall = options.wall ?? Date.now;
    this.debug = options.debug ?? false;
    this.diagnose = options.diagnose;
    this.maxForwardMs = options.maxForwardMs ?? 60_000;
    this.lastWall = this.safeWall();
    const first = this.safeRaw();
    if (first !== undefined) this.lastRaw = first;
  }

  now(): number {
    const wall = this.safeWall();
    const wallDelta = Math.max(0, Math.min(this.maxForwardMs, wall - this.lastWall));
    const current = this.safeRaw();
    let delta = wallDelta;
    if (current === undefined || this.lastRaw === undefined) {
      this.report('invalid', current, wallDelta, wall);
    } else {
      const rawDelta = current - this.lastRaw;
      const scaled = this.selectDelta(rawDelta, wallDelta);
      if (scaled === undefined) this.report(rawDelta < 0 ? 'negative' : 'jump', current, wallDelta, wall);
      else delta = scaled;
    }
    if (current !== undefined) this.lastRaw = current;
    this.lastWall = wall;
    this.elapsedMs += Math.max(0, delta);
    return this.elapsedMs;
  }

  private selectDelta(rawDelta: number, wallDelta: number): number | undefined {
    if (!Number.isFinite(rawDelta) || rawDelta < 0) return undefined;
    const scales = this.scale ? [this.scale] : (wallDelta === 0 ? [1] : [1, 1000, 0.001]);
    let best: { scale: number; delta: number; error: number } | undefined;
    for (const scale of scales) {
      const delta = rawDelta * scale;
      if (!Number.isFinite(delta) || delta > this.maxForwardMs) continue;
      const error = Math.abs(delta - wallDelta);
      if (!best || error < best.error) best = { scale, delta, error };
    }
    const tolerance = Math.max(250, wallDelta * 4 + 50);
    if (!best || (wallDelta > 0 && best.error > tolerance)) return undefined;
    this.scale = best.scale;
    return best.delta;
  }

  private safeRaw() { try { const value = Number(this.raw()); return Number.isFinite(value) ? value : undefined; } catch { return undefined; } }
  private safeWall() { const value = Number(this.wall()); return Number.isFinite(value) ? value : 0; }
  private report(reason: string, raw: number | undefined, wallDelta: number, now: number) {
    if (!this.debug || !this.diagnose) return;
    const last = this.diagnosticsAt.get(reason) ?? -Infinity;
    if (now - last < 10_000) return;
    this.diagnosticsAt.set(reason, now);
    this.diagnose({ reason, raw, wallDelta });
  }
}

export class StateCountdown {
  private roundKey = '';
  private writing?: { remaining: number; at: number };
  private reveal?: { remaining: number; at: number };

  constructor(private readonly monotonic: () => number) {}

  anchor(state: { roundId?: string; serverNow?: EpochValue; deadline?: EpochValue; nextRoundAt?: EpochValue }, fallbackServerNow?: EpochValue) {
    const now = this.monotonic();
    const serverNow = normalizeEpoch(state.serverNow) ?? normalizeEpoch(fallbackServerNow);
    const key = state.roundId ?? '';
    if (key !== this.roundKey) { this.roundKey = key; this.writing = undefined; this.reveal = undefined; }
    this.writing = this.makeAnchor(state.deadline, serverNow, now);
    this.reveal = this.makeAnchor(state.nextRoundAt, serverNow, now);
  }

  remaining(kind: 'writing' | 'reveal'): number | undefined {
    const anchor = kind === 'writing' ? this.writing : this.reveal;
    return anchor ? Math.max(0, anchor.remaining - Math.max(0, this.monotonic() - anchor.at)) : undefined;
  }

  private makeAnchor(target: EpochValue, serverNow: number | undefined, at: number) {
    const deadline = normalizeEpoch(target);
    return deadline !== undefined && serverNow !== undefined ? { remaining: Math.max(0, deadline - serverNow), at } : undefined;
  }
}
