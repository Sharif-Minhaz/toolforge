"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText } from "@/modules/tools/domain/clipboard";

/**
 * The page's only client code: everything it copies is already in the server
 * render, so each button needs nothing but the string and its own check mark.
 */
export function CopyValueButton({ value, label }: { value: string; label: string }) {
    const t = useTranslations("myIp.toast");
    const [copied, setCopied] = useCopyFeedback<"value">();

    async function handleCopy() {
        const result = await copyText(value);

        if (!result.ok) {
            toast.error(t(`copyFailed.${result.reason}`));

            return;
        }

        setCopied("value");
    }

    return (
        <IconCopyButton
            copied={copied === "value"}
            onClick={handleCopy}
            aria-label={label}
            title={label}
            className="-my-1"
        />
    );
}
