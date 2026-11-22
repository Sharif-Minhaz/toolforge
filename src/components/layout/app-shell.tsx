import type { ReactNode } from "react";

import { getTools } from "@/modules/tools/domain/tool-catalog";
import { localizeTools } from "@/modules/tools/presenters/localize-tools";
import { ShellFrame } from "./shell-frame";

/**
 * Server half of the application chrome: resolves catalog copy and hands it to
 * the interactive frame. Reads nothing from the request, so it prerenders; the
 * rail state comes from `SIDEBAR_BOOT_SCRIPT` instead.
 */
export async function AppShell({ children }: { children: ReactNode }) {
    const tools = await localizeTools(getTools());

    return <ShellFrame tools={tools}>{children}</ShellFrame>;
}
