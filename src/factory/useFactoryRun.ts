import { useCallback, useMemo, useState } from "react";

import { FACTORY_STEPS, type StepId, type StepResult } from "./factoryTypes";

/*
 * Sequencing for the bench pipeline.
 *
 * Each step component owns its own work and reports back when it finished; this
 * hook only decides what runs next and what the unit's verdict is. Keeping the
 * async work in the steps is what lets one block on a human (press the unlock
 * chord, press every key) without the pipeline needing a state per possible wait.
 *
 * Two rules shape the sequencing, both learned from what a bench actually needs:
 *
 *  - A failed step skips the remaining tests and goes straight to the wrap-up.
 *    The wrap-up still has to run — a board must not be left unlocked or holding
 *    the scan's temporary layer just because the scan failed — but there is no
 *    point measuring an IMU on a unit that is already scrap. The skipped steps
 *    are recorded as `skip`, never as pass.
 *
 *  - Re-testing a step clears that step *and everything after it*. Otherwise a
 *    retest that passes would leave the steps the first failure skipped still
 *    marked skip, and the unit would be stamped PASS with its IMU never tested.
 */

export interface FactoryRun {
  index: number;
  stepId: StepId | undefined;
  results: Partial<Record<StepId, StepResult>>;
  finished: boolean;
  verdict: "pass" | "fail" | "running";
  complete: (id: StepId, result: StepResult) => void;
  restart: () => void;
  goTo: (id: StepId) => void;
}

const FINISH_INDEX = FACTORY_STEPS.findIndex((s) => s.id === "finish");

export function useFactoryRun(): FactoryRun {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Partial<Record<StepId, StepResult>>>({});

  const complete = useCallback((id: StepId, result: StepResult) => {
    const at = FACTORY_STEPS.findIndex((s) => s.id === id);

    setResults((prev) => {
      const next: Partial<Record<StepId, StepResult>> = { ...prev, [id]: result };
      if (result.status === "fail" && at >= 0) {
        for (let i = at + 1; i < FINISH_INDEX; i++) {
          const step = FACTORY_STEPS[i];
          if (next[step.id] === undefined) {
            next[step.id] = { status: "skip", detail: "前序步骤失败，未执行" };
          }
        }
      }
      return next;
    });

    setIndex((prev) => {
      if (at < 0) return prev;
      if (result.status === "fail") return Math.max(prev, FINISH_INDEX);
      return Math.max(prev, at + 1);
    });
  }, []);

  const restart = useCallback(() => {
    setResults({});
    setIndex(0);
  }, []);

  const goTo = useCallback((id: StepId) => {
    const at = FACTORY_STEPS.findIndex((s) => s.id === id);
    if (at < 0) return;
    setResults((prev) => {
      const next = { ...prev };
      for (let i = at; i < FACTORY_STEPS.length; i++) {
        delete next[FACTORY_STEPS[i].id];
      }
      return next;
    });
    setIndex(at);
  }, []);

  const finished = index >= FACTORY_STEPS.length;

  const verdict = useMemo<"pass" | "fail" | "running">(() => {
    const values = Object.values(results);
    if (values.some((r) => r?.status === "fail")) return "fail";
    if (!finished) return "running";
    // Reaching the end with nothing but skips means nothing was actually tested.
    if (values.length === 0 || values.every((r) => r?.status === "skip")) return "fail";
    return "pass";
  }, [results, finished]);

  return {
    index,
    stepId: FACTORY_STEPS[index]?.id,
    results,
    finished,
    verdict,
    complete,
    restart,
    goTo,
  };
}
