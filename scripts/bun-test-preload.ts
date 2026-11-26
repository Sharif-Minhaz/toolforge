import { startupSnapshot } from "node:v8";

// shortcut: Bun 1.3.x stubs `v8.startupSnapshot.isBuildingSnapshot` with a function that
// throws NotImplementedError, and bson@7 calls it while its module loads, so every test that
// imports bson fails before running. Node and Bun ≥ 1.4.0 return `false` — nobody builds a V8
// startup snapshot under `bun test`. Delete this file and `bunfig.toml` once Bun ≥ 1.4 is required.
try {
    startupSnapshot.isBuildingSnapshot();
} catch {
    Object.defineProperty(startupSnapshot, "isBuildingSnapshot", { value: () => false });
}
