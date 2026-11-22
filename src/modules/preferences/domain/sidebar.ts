export const SIDEBAR_COOKIE = "toolforge.sidebar";

export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const COLLAPSED_VALUE = "collapsed";

/** Set on `<html>`; `globals.css` sizes the rail from it before anything hydrates. */
export const SIDEBAR_ATTRIBUTE = "data-sidebar";

/**
 * Runs first in `<body>`, before the shell is parsed or painted. The page is prerendered, so the server
 * cannot know the rail state; reading the cookie here — the way `next-themes`
 * reads the theme — keeps the content column from jumping sideways on load.
 */
export const SIDEBAR_BOOT_SCRIPT = `try{if(document.cookie.split("; ").includes("${SIDEBAR_COOKIE}=${COLLAPSED_VALUE}"))document.documentElement.setAttribute("${SIDEBAR_ATTRIBUTE}","${COLLAPSED_VALUE}")}catch(e){}`;

/** What the boot script (or the last toggle) left on `<html>`. */
export function readSidebarCollapsed(): boolean {
    return document.documentElement.getAttribute(SIDEBAR_ATTRIBUTE) === COLLAPSED_VALUE;
}

/** Applies the state to `<html>` and persists it for the next page load. */
export function writeSidebarCollapsed(collapsed: boolean): void {
    if (collapsed) {
        document.documentElement.setAttribute(SIDEBAR_ATTRIBUTE, COLLAPSED_VALUE);
    } else {
        document.documentElement.removeAttribute(SIDEBAR_ATTRIBUTE);
    }

    persistSidebarState(collapsed);
}

/** Written straight to `document.cookie`; the boot script reads it on the next load. */
export function persistSidebarState(collapsed: boolean): void {
    if (typeof document === "undefined") {
        return;
    }

    const value = collapsed ? COLLAPSED_VALUE : "expanded";
    document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
}
