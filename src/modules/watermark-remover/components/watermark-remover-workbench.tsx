"use client";

import { IconPhoto, IconSparkles, IconVideo } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WatermarkMode } from "../types";
import { GeminiPanel } from "./gemini-panel";
import { ImagePanel } from "./image-panel";
import { VideoPanel } from "./video-panel";

type WatermarkRemoverWorkbenchProps = {
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables the picture half. */
    siteKey: string | null;
    /** Whether this deployment can fetch a picture by its address at all. */
    urlImportEnabled: boolean;
};

/**
 * The card all three halves live in, and the strip that switches between them.
 *
 * They share a name and nothing else. A picture goes to an image model over
 * the network and comes back repainted; a Gemini still never leaves the browser
 * and has a known blend arithmetically undone; a clip never leaves the browser
 * and has one fixed corner rebuilt from its own surroundings, frame by frame.
 * Keeping them as separate panels under one strip is what lets each say the
 * truth about itself — the failures and the controls all differ —
 * without a single component growing three of everything.
 *
 * The order is deliberate: the two picture tabs sit next to each other, because
 * a reader arriving with a still has to choose between them and the choice is
 * easier when they are adjacent.
 *
 * Every panel stays mounted. A clip takes a minute of the reader's machine to
 * clean, and losing that because they glanced at another tab would be the worst
 * moment in the tool.
 */
export function WatermarkRemoverWorkbench({
    siteKey,
    urlImportEnabled,
}: WatermarkRemoverWorkbenchProps) {
    const t = useTranslations("watermarkRemover.workbench");
    const [mode, setMode] = useState<WatermarkMode>("image");

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
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
                        <TabsTrigger value="gemini">
                            <IconSparkles stroke={1.8} aria-hidden="true" />
                            {t("tabGemini")}
                        </TabsTrigger>
                        <TabsTrigger value="video">
                            <IconVideo stroke={1.8} aria-hidden="true" />
                            {t("tabVideo")}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="image" className="min-w-0 pt-4" keepMounted>
                        <ImagePanel
                            siteKey={siteKey}
                            urlImportEnabled={urlImportEnabled}
                            active={mode === "image"}
                        />
                    </TabsContent>

                    <TabsContent value="gemini" className="min-w-0 pt-4" keepMounted>
                        <GeminiPanel active={mode === "gemini"} />
                    </TabsContent>

                    <TabsContent value="video" className="min-w-0 pt-4" keepMounted>
                        <VideoPanel />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
