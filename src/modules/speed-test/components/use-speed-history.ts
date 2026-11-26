"use client";

import { useSyncExternalStore } from "react";

import { PLAN_STORAGE_KEY, RUNS_STORAGE_KEY } from "../domain/constants";
import { forgetRuns, keepPlan, keepRun, readPlan, readRuns } from "../domain/history";
import type { SpeedRun } from "../types";

/**
 * Kept runs and the plan, bound to React the way
 * `docs/patterns/browser-persistence.md` says: `useSyncExternalStore`, a server
 * snapshot of "nothing kept", and a module-level snapshot so `getSnapshot`
 * hands back a stable reference.
 */

type Snapshot = { readonly runs: readonly SpeedRun[]; readonly plan: string };

const SERVER_SNAPSHOT: Snapshot = { runs: [], plan: "" };

let snapshot: Snapshot = SERVER_SNAPSHOT;
let loaded = false;
const listeners = new Set<() => void>();

function refresh(): void {
    snapshot = { runs: readRuns(), plan: readPlan() };
    loaded = true;

    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    // A test finished in a second tab shows up here too.
    const onStorage = (event: StorageEvent) => {
        if (
            event.key === RUNS_STORAGE_KEY ||
            event.key === PLAN_STORAGE_KEY ||
            event.key === null
        ) {
            refresh();
        }
    };

    window.addEventListener("storage", onStorage);

    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

function getSnapshot(): Snapshot {
    if (!loaded) {
        snapshot = { runs: readRuns(), plan: readPlan() };
        loaded = true;
    }

    return snapshot;
}

function getServerSnapshot(): Snapshot {
    return SERVER_SNAPSHOT;
}

export function useSpeedHistory() {
    const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    return {
        runs: current.runs,
        plan: current.plan,
        keep(run: SpeedRun) {
            keepRun(run);
            refresh();
        },
        forget() {
            forgetRuns();
            refresh();
        },
        setPlan(plan: string) {
            keepPlan(plan);
            refresh();
        },
    };
}
