"use client";

import { IconLock } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { PixelSize } from "@/modules/tools/types";

import { defaultChoiceForTab } from "../domain/background";
import { BACKGROUND_TABS, type BackgroundChoice, type BackgroundTab } from "../types";
import { BlurPicker } from "./blur-picker";
import { ColorPicker } from "./color-picker";
import { PhotoPicker } from "./photo-picker";

type BackgroundPanelProps = {
    readonly tab: BackgroundTab;
    readonly onTabChange: (tab: BackgroundTab) => void;
    readonly value: BackgroundChoice;
    readonly size: PixelSize;
    /**
     * False until this slot has a cut-out. Every tab is locked until then: there
     * is nothing to put a background behind, and a picker that composites
     * nothing is a control that lies about what it does.
     */
    readonly unlocked: boolean;
    readonly busy: boolean;
    readonly searchEnabled: boolean;
    readonly initialQuery: string;
    readonly onChange: (choice: BackgroundChoice) => void;
    readonly onUpload: (file: File) => void;
    readonly className?: string;
};

/**
 * The three-tab background picker.
 *
 * Switching tabs *is* a choice, not a preview: landing on Blur applies the blur,
 * landing on Colour applies the last colour. The Photo tab is the exception and
 * has to be — there is no sensible "some photograph", and picking one on the
 * reader's behalf would put a stranger's picture behind their portrait without
 * them asking. So it leaves the current background alone until a tile is pressed.
 */
export function BackgroundPanel({
    tab,
    onTabChange,
    value,
    size,
    unlocked,
    busy,
    searchEnabled,
    initialQuery,
    onChange,
    onUpload,
    className,
}: BackgroundPanelProps) {
    const t = useTranslations("backgroundRemover.backgrounds");

    const disabled = !unlocked || busy;

    function handleTabChange(next: BackgroundTab) {
        onTabChange(next);

        const choice = defaultChoiceForTab(next);

        if (unlocked && choice !== null) {
            onChange(choice);
        }
    }

    return (
        <section
            aria-label={t("label")}
            className={cn(
                "ring-border/70 bg-card/60 flex min-w-0 flex-col gap-3 rounded-2xl p-3 ring-1 ring-inset sm:p-4",
                "transition-opacity duration-200",
                !unlocked && "opacity-70",
                className,
            )}
        >
            <Tabs
                value={tab}
                onValueChange={(next) => {
                    if (next !== null) {
                        handleTabChange(next as BackgroundTab);
                    }
                }}
            >
                <TabsList className="w-full">
                    {BACKGROUND_TABS.map((name) => (
                        <TabsTrigger key={name} value={name} disabled={disabled} className="flex-1">
                            {t(`tabs.${name}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/*
                 * `keepMounted` on all three, and it is not a micro-optimisation.
                 *
                 * Base UI unmounts a hidden panel by default. That threw away the
                 * Photo tab's fetched results every time the reader looked at
                 * Colour, and remounting refired the search — spending the
                 * deployment's shared Pexels allowance again to show the same
                 * grid, and losing the scroll position and the typed query with
                 * it. The same rule the FAQ accordion follows for
                 * find-in-page, applied to state rather than to text.
                 *
                 * All three rather than only Photo, so there is one rule here
                 * instead of one per panel: the Colour tab's half-typed hex draft
                 * was quietly resetting for exactly the same reason.
                 */}
                <TabsContent value="blur" keepMounted className="pt-3">
                    <BlurPicker value={value} size={size} disabled={disabled} onChange={onChange} />
                </TabsContent>

                <TabsContent value="photo" keepMounted className="pt-3">
                    <PhotoPicker
                        value={value}
                        disabled={disabled}
                        searchEnabled={searchEnabled}
                        initialQuery={initialQuery}
                        onChange={onChange}
                        onUpload={onUpload}
                    />
                </TabsContent>

                <TabsContent value="color" keepMounted className="pt-3">
                    <ColorPicker value={value} disabled={disabled} onChange={onChange} />
                </TabsContent>
            </Tabs>

            {!unlocked && (
                <p className="text-muted-foreground flex items-start gap-1.5 text-[0.6875rem] leading-normal">
                    <IconLock className="mt-px size-3.5 shrink-0" stroke={1.9} aria-hidden="true" />
                    <span>{t("lockedHint")}</span>
                </p>
            )}
        </section>
    );
}
