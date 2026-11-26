import { useRef } from "react";
export interface CoalesceOptions {
  minIntervalMs?: number;
  onApplied?: () => void;
  onFailed?: () => void;
}

export interface CoalescedSender<T> {
  push: (value: T) => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createCoalescedSender<T>(
  send: (value: T) => Promise<boolean>,
  options: CoalesceOptions = {}
): CoalescedSender<T> {
  const minInterval = options.minIntervalMs ?? 0;
  let queued: T | undefined;
  let hasQueued = false;
  let sent: T | undefined;
  let hasSent = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastStart = 0;
  let cancelled = false;
  let idleWaiters: Array<() => void> = [];

  const settle = () => {
    if (inFlight || hasQueued || !idleWaiters.length) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  };

  const schedule = (delay: number) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void pump();
    }, delay);
  };

  async function pump(): Promise<void> {
    if (cancelled || inFlight || !hasQueued) {
      settle();
      return;
    }

    const wait = lastStart + minInterval - Date.now();
    if (wait > 0) {
      schedule(wait);
      return;
    }

    const value = queued as T;
    hasQueued = false;
    inFlight = true;
    lastStart = Date.now();
    let ok = false;
    try {
      ok = await send(value);
    } catch {
      ok = false;
    }
    inFlight = false;
    if (cancelled) return;

    if (ok) {
      sent = value;
      hasSent = true;
      options.onApplied?.();
    } else {
      options.onFailed?.();
    }

    if (hasQueued) {
      void pump();
    } else {
      settle();
    }
  }

  return {
    push(value: T) {
      if (cancelled) return;
      // Same value as what is already queued or already applied: nothing to do.
      if (hasQueued && sameValue(queued, value)) return;
      if (!hasQueued && !inFlight && hasSent && sameValue(sent, value)) return;
      queued = value;
      hasQueued = true;
      if (!inFlight && timer === undefined) void pump();
    },

    async flush() {
      if (!inFlight && !hasQueued) return;
      await new Promise<void>((resolve) => idleWaiters.push(resolve));
    },

    cancel() {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      hasQueued = false;
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    },
  };
}

// Stable across renders: the sender outlives callback identity changes, so a
// re-render mid-drag cannot spawn a second in-flight request.
export function useCoalescedSender<T>(
  send: (value: T) => Promise<boolean>,
  options: CoalesceOptions = {}
): CoalescedSender<T> {
  const sendRef = useRef(send);
  sendRef.current = send;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const senderRef = useRef<CoalescedSender<T> | null>(null);
  if (!senderRef.current) {
    senderRef.current = createCoalescedSender<T>((value) => sendRef.current(value), {
      minIntervalMs: options.minIntervalMs,
      onApplied: () => optionsRef.current.onApplied?.(),
      onFailed: () => optionsRef.current.onFailed?.(),
    });
  }

  return senderRef.current;
}
