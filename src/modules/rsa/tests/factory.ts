import { DEFAULT_RSA_OPTIONS } from "../domain/constants";
import type { RsaOptions } from "../types";

/**
 * One place every test builds its option set from, so widening `RsaOptions`
 * later is one edit rather than one per call site.
 *
 * The key size is deliberately 1024 rather than the tool's 2048 default: these
 * tests generate real RSA keys through real Web Crypto, and prime search at 2048
 * bits turns a suite that runs in a second into one that runs in a minute.
 * Nothing under test depends on the width beyond it being reported back
 * correctly, and `readsBackTheModulusWidth` checks the wider sizes on their own.
 */
export function options(overrides: Partial<RsaOptions> = {}): RsaOptions {
    return { ...DEFAULT_RSA_OPTIONS, keySize: 1024, ...overrides };
}
