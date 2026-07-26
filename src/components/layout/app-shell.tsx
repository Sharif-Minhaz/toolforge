import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { isCollapsedCookieValue, SIDEBAR_COOKIE } from "@/modules/preferences/domain/sidebar";
import { getTools } from "@/modules/tools/domain/tool-catalog";
import { localizeTools } from "@/modules/tools/presenters/localize-tools";
import { ShellFrame } from "./shell-frame";

/**
 * Server half of the application chrome: resolves catalog copy and the
 * persisted rail state, then hands both to the interactive frame.
 */
export async function AppShell({ children }: { children: ReactNode }) {
    const [tools, cookieStore] = await Promise.all([localizeTools(getTools()), cookies()]);
    const defaultCollapsed = isCollapsedCookieValue(cookieStore.get(SIDEBAR_COOKIE)?.value);

    return (
        <ShellFrame tools={tools} defaultCollapsed={defaultCollapsed}>
            {children}
        </ShellFrame>
    );
}
