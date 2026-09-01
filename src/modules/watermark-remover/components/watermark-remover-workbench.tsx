"use client";

import { IconPhoto, IconVideo } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WatermarkMode } from "../types";
import { ImagePanel } from "./image-panel";
import { VideoPanel } from "./video-panel";

type WatermarkRemoverWorkbenchProps = {
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables the picture half. */
    siteKey: string | null;
    /** Whether this deployment can fetch a picture by its address at all. */
    urlImportEnabled: boolean;
};

/**
 * The card both halves live in, and the strip that switches between them.
 *
 * The two halves share a name and nothing else. A picture goes to an inpainting
 * model over the network and comes back repainted; a clip never leaves the
 * browser and has one fixed corner rebuilt from its own surroundings. Keeping
 * them as separate panels under one strip is what lets each say the truth about
 * itself — the privacy note, the failures, the controls all differ — without a
 * single component growing two of everything.
 *
 * Both panels stay mounted. A clip takes a minute of the reader's machine to
 * clean, and losing that because they glanced at the other tab would be the
 * worst moment in the tool.
 */
export function WatermarkRemoverWorkbench({
    siteKey,
    urlImportEnabled,
}: WatermarkRemoverWorkbenchProps) {
    const t = useTranslations("watermarkRemover.workbench");
    const [mode, setMode] = useState<WatermarkMode>("image");

    return (
        <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t(`${mode}Title`)}</CardTitle>
                <CardDescription>{t(`${mode}Description`)}</CardDescription>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <Tabs
                    value={mode}
                    onValueChange={(next) => setMode(next as WatermarkMode)}
                    className="min-w-0"
                >
                    <TabsList className="w-full">
                        <TabsTrigger value="image">
                            <IconPhoto stroke={1.8} aria-hidden="true" />
                            {t("tabImage")}
                        </TabsTrigger>
                        <TabsTrigger value="video">
                            <IconVideo stroke={1.8} aria-hidden="true" />
                            {t("tabVideo")}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="image" className="min-w-0 pt-4" keepMounted>
                        <ImagePanel siteKey={siteKey} urlImportEnabled={urlImportEnabled} />
                    </TabsContent>

                    <TabsContent value="video" className="min-w-0 pt-4" keepMounted>
                        <VideoPanel />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
