"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { JwtExample } from "../domain/examples";
import type { JwtMode } from "../types";
import { JwtDecoder } from "./jwt-decoder";
import { JwtEncoder } from "./jwt-encoder";
import { ModeSelector } from "./mode-selector";

type JwtWorkbenchProps = {
    initialMode: JwtMode;
    /** Server-rendered instant, so claim states hydrate without a mismatch. */
    initialNow: string;
    /** Signed on the server, so the first paint is already a worked example. */
    example: JwtExample | null;
};

export function JwtWorkbench({ initialMode, initialNow, example }: JwtWorkbenchProps) {
    const t = useTranslations("jwt.workbench");
    const modeLabelId = useId();

    const [mode, setMode] = useState<JwtMode>(initialMode);

    return (
        <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <div className="flex max-w-md flex-col gap-2">
                    <Label id={modeLabelId} className="text-muted-foreground text-xs">
                        {t("modeLabel")}
                    </Label>
                    <ModeSelector value={mode} onChange={setMode} labelId={modeLabelId} />
                </div>

                {mode === "decode" ? (
                    <JwtDecoder initialNow={initialNow} example={example} />
                ) : (
                    <JwtEncoder example={example} />
                )}
            </CardContent>
        </Card>
    );
}
