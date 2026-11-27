"use client";

import { useSyncExternalStore } from "react";

import { isPhone } from "@/modules/tools/domain/device";

/** The one piece of `NavigatorUAData` this reads; TypeScript's DOM types lack it. */
type UserAgentDataNavigator = Navigator & { userAgentData?: { mobile?: boolean } };

// A device does not stop being a phone mid-visit, so there is nothing to
// subscribe to.
const subscribe = () => () => {};

function getSnapshot(): boolean {
    const nav = navigator as UserAgentDataNavigator;

    return isPhone(nav.userAgent, nav.userAgentData?.mobile);
}

/**
 * Whether this is a phone. `false` on the server and during hydration, so the
 * prerendered markup and the first client pass agree; a phone drops what it
 * does not need one render later.
 */
export function useIsPhone(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
