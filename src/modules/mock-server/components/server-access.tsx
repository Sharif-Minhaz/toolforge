"use client";

import { useTranslations } from "next-intl";

import { ServerAccessPanel } from "@/modules/tools/components/server-access-panel";
import type { ServerAccess as ServerAccessMode } from "@/modules/tools/domain/access-token";

import { rotateAccessToken, setServerAccess } from "../actions/servers";

type ServerAccessProps = {
    serverId: string;
    access: ServerAccessMode;
    hasAccessToken: boolean;
};

/** The shared access panel, bound to this studio's actions and error copy. */
export function ServerAccess({ serverId, access, hasAccessToken }: ServerAccessProps) {
    const tErrors = useTranslations("mockServer.serverErrors");

    return (
        <ServerAccessPanel
            access={access}
            hasAccessToken={hasAccessToken}
            onSetAccess={async (next) => {
                const result = await setServerAccess({ serverId, access: next });

                return result.ok ? null : tErrors(result.reason);
            }}
            onRotate={async () => {
                const result = await rotateAccessToken({ serverId });

                return result.ok ? { token: result.token } : { failure: tErrors(result.reason) };
            }}
        />
    );
}
