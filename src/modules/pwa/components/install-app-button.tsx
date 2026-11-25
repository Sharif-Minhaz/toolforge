"use client";

import { IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { promptInstall, useInstallStatus } from "./install-store";

/**
 * Opens the browser's own install dialog. Renders nothing where installing is
 * impossible or already done; where the dialog cannot be opened from a page
 * (iOS, or after a dismissal) it says how to install instead.
 */
export function InstallAppButton({ className }: { readonly className?: string }) {
    const t = useTranslations("pwa.install");
    const status = useInstallStatus();
    const [hintShown, setHintShown] = useState(false);

    if (status === "none") {
        return null;
    }

    return (
        <>
            <Button
                type="button"
                className={className}
                aria-expanded={status === "ready" ? undefined : hintShown}
                onClick={() => {
                    if (status === "ready") {
                        void promptInstall();
                    } else {
                        setHintShown((shown) => !shown);
                    }
                }}
            >
                <IconDownload className="size-4" stroke={1.9} aria-hidden="true" />
                {t("button")}
            </Button>
            {hintShown && status !== "ready" && (
                <p
                    role="status"
                    className="text-muted-foreground order-last w-full text-[0.8125rem]"
                >
                    {status === "ios" ? t("hintIos") : t("hintMenu")}
                </p>
            )}
        </>
    );
}
