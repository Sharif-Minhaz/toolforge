export const SIDEBAR_COOKIE = "toolforge.sidebar";

export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const COLLAPSED_VALUE = "collapsed";

export function isCollapsedCookieValue(value: string | undefined): boolean {
    return value === COLLAPSED_VALUE;
}

/**
 * Written straight to `document.cookie` rather than through a server action —
 * the layout reads it on the next request so the sidebar never flashes open
 * before hydration.
 */
export function persistSidebarState(collapsed: boolean): void {
    if (typeof document === "undefined") {
        return;
    }

    const value = collapsed ? COLLAPSED_VALUE : "expanded";
    document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
}
