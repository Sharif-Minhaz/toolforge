"use client";

import { IconColorPicker, IconDice5, IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { MAX_COLOR_INPUT_LENGTH } from "../domain/constants";
import { CHECKERBOARD } from "./channel-slider";

/**
 * `EyeDropper` is not in the DOM type library yet. Declaring the slice this
 * component uses keeps the call typed without reaching for `any`.
 */
type EyeDropperInstance = {
    open: () => Promise<{ sRGBHex: string }>;
};

type EyeDropperConstructor = new () => EyeDropperInstance;

function getEyeDropper(): EyeDropperConstructor | null {
    if (typeof window === "undefined") {
        return null;
    }

    return (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper ?? null;
}

type ColorInputProps = {
    value: string;
    /** The picked colour as a CSS value, shown in the preview chip. */
    preview: string;
    tone: StatusTone;
    message: string;
    onChange: (value: string) => void;
    onRandom: () => void;
    onPick: (hex: string) => void;
    onDownload: () => void;
};

export function ColorInput({
    value,
    preview,
    tone,
    message,
    onChange,
    onRandom,
    onPick,
    onDownload,
}: ColorInputProps) {
    const t = useTranslations("color.workbench");
    const inputId = useId();
    const statusId = useId();

    // The button is rendered only after hydration, so the server pass and the
    // first client pass agree on the markup regardless of the browser.
    const hydrated = useIsHydrated();
    const eyeDropper = hydrated ? getEyeDropper() : null;

    async function handleEyeDrop() {
        const Constructor = getEyeDropper();

        if (Constructor === null) {
            return;
        }

        try {
            const { sRGBHex } = await new Constructor().open();

            onPick(sRGBHex);
        } catch {
            // The only way this rejects is the user pressing Escape, which is a
            // cancellation rather than a failure worth reporting.
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                {t("inputLabel")}
            </Label>

            <div className="flex flex-wrap items-center gap-2">
                <span
                    aria-hidden="true"
                    className="ring-border/70 size-10 shrink-0 overflow-hidden rounded-xl ring-1 ring-inset"
                    style={{ background: CHECKERBOARD }}
                >
                    <span className="block size-full" style={{ background: preview }} />
                </span>

                <Input
                    id={inputId}
                    // Capped. The longest notation this parses — an `oklch()`
                    // with four spelled-out components — is under forty
                    // characters, so no meter: there is no "nearly full" state
                    // worth reporting on a field nothing legitimate fills.
                    maxLength={MAX_COLOR_INPUT_LENGTH}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={t("inputPlaceholder")}
                    aria-describedby={statusId}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="min-w-40 flex-1 font-mono text-[0.8125rem]"
                />

                <div className="flex items-center gap-1.5">
                    {eyeDropper !== null && (
                        <Button variant="outline" size="sm" onClick={handleEyeDrop}>
                            <IconColorPicker className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {t("pick")}
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={onRandom}>
                        <IconDice5 className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("random")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={onDownload}>
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </Button>
                </div>
            </div>

            <StatusStrip id={statusId} tone={tone} message={message} />
        </div>
    );
}
