"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { formatOffset } from "../domain/format";
import { parseOffsetInput } from "../domain/goto";
import type { GoToFailureReason } from "../types";
import { useHexStore } from "./hex-store";

/**
 * Jump to an offset. `512`, `0x200` and `200h` are all accepted; a plain number
 * is decimal, because nothing on screen would tell a reader if it were not.
 */
export function GoToDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations("hexEditor.goto");
    const tErrors = useTranslations("hexEditor.errors");

    const fieldId = useId();
    const statusId = useId();

    const length = useHexStore((state) => state.document?.length ?? 0);
    const goToOffset = useHexStore((state) => state.goToOffset);

    const [value, setValue] = useState("");
    const [failure, setFailure] = useState<GoToFailureReason | null>(null);

    function describe(reason: GoToFailureReason): string {
        switch (reason) {
            case "empty":
                return tErrors("gotoEmpty");
            case "not_a_number":
                return tErrors("gotoNotANumber");
            case "out_of_range":
                return tErrors("gotoOutOfRange", { last: formatOffset(Math.max(0, length - 1)) });
        }
    }

    function handleSubmit() {
        const parsed = parseOffsetInput(value, length);

        if (!parsed.ok) {
            setFailure(parsed.reason);

            return;
        }

        setFailure(null);
        goToOffset(parsed.offset);
        onOpenChange(false);
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);

                if (!next) {
                    setFailure(null);
                }
            }}
        >
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor={fieldId} className="text-muted-foreground text-xs">
                        {t("label")}
                    </Label>
                    <Input
                        id={fieldId}
                        value={value}
                        autoFocus
                        spellCheck={false}
                        autoComplete="off"
                        maxLength={32}
                        placeholder={t("placeholder")}
                        aria-describedby={statusId}
                        onChange={(event) => {
                            setValue(event.target.value);
                            setFailure(null);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                handleSubmit();
                            }
                        }}
                        className="font-mono"
                    />
                    <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                        {t("hint")}
                    </p>
                    {failure !== null && (
                        <StatusStrip id={statusId} tone="error" message={describe(failure)} />
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        {t("cancel")}
                    </Button>
                    <Button size="sm" onClick={handleSubmit}>
                        {t("jump")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
