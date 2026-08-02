"use client";

import { IconUpload, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DiffSide } from "../types";

type DiffInputPanelProps = {
    side: DiffSide;
    inputId: string;
    value: string;
    onChange: (value: string) => void;
    onFileSelect: (file: File) => void;
};

/**
 * One of the two boxes. Both halves are the same control, so the label and the
 * accessible names for its buttons are built from the side rather than written
 * twice — a copy that only exists once cannot drift out of step with itself.
 */
export function DiffInputPanel({
    side,
    inputId,
    value,
    onChange,
    onFileSelect,
}: DiffInputPanelProps) {
    const t = useTranslations("diff.workbench");
    const label = t(`${side}Label`);

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const selected = event.target.files?.[0];

        if (selected) {
            onFileSelect(selected);
        }

        // Reset so picking the same file twice still fires a change event.
        event.target.value = "";
    }

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{label}</span>
                </Label>

                <div className="flex items-center gap-1">
                    {/* A styled label keeps the file picker a real <input>, so it
                        stays keyboard reachable without any imperative click. */}
                    <label
                        className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "focus-within:ring-ring cursor-pointer focus-within:ring-2",
                        )}
                    >
                        <IconUpload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("upload")}
                        <input
                            type="file"
                            accept="text/*,.txt,.md,.json,.csv,.log,.yml,.yaml"
                            className="sr-only"
                            onChange={handleFileChange}
                            aria-label={t("uploadSide", { side: label })}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={() => onChange("")}
                        disabled={value.length === 0}
                        aria-label={t("clearSide", { side: label })}
                        className={cn(
                            buttonVariants({ variant: "ghost", size: "icon-sm" }),
                            "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <Textarea
                id={inputId}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={t(`${side}Placeholder`)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                className="bg-card/70 max-h-96 min-h-40 resize-y rounded-xl font-mono text-[0.8125rem] leading-6"
            />
        </div>
    );
}
