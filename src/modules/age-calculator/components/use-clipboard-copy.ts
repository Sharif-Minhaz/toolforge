"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { copyText } from "@/modules/tools/domain/clipboard";

/** Copies `text` and says how it went; resolves `true` when it reached the clipboard. */
export function useClipboardCopy(): (text: string) => Promise<boolean> {
    const t = useTranslations("ageCalculator.toast");

    return async (text) => {
        const copied = await copyText(text);

        if (!copied.ok) {
            toast.error(
                copied.reason === "empty"
                    ? t("copyFailedEmpty")
                    : copied.reason === "unsupported"
                      ? t("copyFailedUnsupported")
                      : t("copyFailedDenied"),
            );

            return false;
        }

        toast.success(t("copied"));

        return true;
    };
}
