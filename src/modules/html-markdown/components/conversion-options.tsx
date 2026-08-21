"use client";

import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";

import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { BULLET_CHARACTERS, EMPHASIS_CHARACTERS } from "../domain/constants";
import { appliesTo, keepsCodeLanguage } from "../domain/convert";
import {
    BULLET_MARKERS,
    CODE_BLOCK_STYLES,
    EMPHASIS_STYLES,
    HEADING_STYLES,
    LINK_STYLES,
    type BulletMarker,
    type CodeBlockStyle,
    type EmphasisStyle,
    type HeadingStyle,
    type HtmlMarkdownMode,
    type HtmlMarkdownOptions,
    type LinkStyle,
} from "../types";

type ConversionOptionsProps = {
    mode: HtmlMarkdownMode;
    options: HtmlMarkdownOptions;
    onChange: (patch: Partial<HtmlMarkdownOptions>) => void;
};

export function ConversionOptions({ mode, options, onChange }: ConversionOptionsProps) {
    const t = useTranslations("htmlMarkdown.workbench");

    // The bullet and emphasis pickers show the character itself beside its
    // name, because the character is the whole of what the option does and no
    // translation of "asterisk" is faster to read than `*`.
    const headingItems = useMemo<Record<string, ReactNode>>(
        () => Object.fromEntries(HEADING_STYLES.map((style) => [style, t(`headings.${style}`)])),
        [t],
    );

    const bulletItems = useMemo<Record<string, ReactNode>>(
        () =>
            Object.fromEntries(
                BULLET_MARKERS.map((marker) => [
                    marker,
                    `${BULLET_CHARACTERS[marker]}  ${t(`bullets.${marker}`)}`,
                ]),
            ),
        [t],
    );

    const codeBlockItems = useMemo<Record<string, ReactNode>>(
        () =>
            Object.fromEntries(CODE_BLOCK_STYLES.map((style) => [style, t(`codeBlocks.${style}`)])),
        [t],
    );

    const emphasisItems = useMemo<Record<string, ReactNode>>(
        () =>
            Object.fromEntries(
                EMPHASIS_STYLES.map((style) => [
                    style,
                    `${EMPHASIS_CHARACTERS[style]}  ${t(`emphases.${style}`)}`,
                ]),
            ),
        [t],
    );

    const linkItems = useMemo<Record<string, ReactNode>>(
        () => Object.fromEntries(LINK_STYLES.map((style) => [style, t(`links.${style}`)])),
        [t],
    );

    const writesMarkdown = appliesTo("headingStyle", mode);

    return (
        <div className="flex flex-col gap-3">
            {writesMarkdown && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <OptionSelect<HeadingStyle>
                        label={t("headingStyleLabel")}
                        value={options.headingStyle}
                        items={headingItems}
                        values={HEADING_STYLES}
                        onChange={(headingStyle) => onChange({ headingStyle })}
                    />
                    <OptionSelect<BulletMarker>
                        label={t("bulletMarkerLabel")}
                        value={options.bulletMarker}
                        items={bulletItems}
                        values={BULLET_MARKERS}
                        onChange={(bulletMarker) => onChange({ bulletMarker })}
                    />
                    <OptionSelect<CodeBlockStyle>
                        label={t("codeBlockStyleLabel")}
                        // Indenting a block leaves nowhere to write the
                        // language, so the hint says what the choice costs
                        // rather than letting it be discovered in a diff.
                        hint={
                            keepsCodeLanguage(options)
                                ? t("codeBlockFencedHint")
                                : t("codeBlockIndentedHint")
                        }
                        value={options.codeBlockStyle}
                        items={codeBlockItems}
                        values={CODE_BLOCK_STYLES}
                        onChange={(codeBlockStyle) => onChange({ codeBlockStyle })}
                    />
                    <OptionSelect<EmphasisStyle>
                        label={t("emphasisStyleLabel")}
                        hint={t("emphasisStyleHint")}
                        value={options.emphasisStyle}
                        items={emphasisItems}
                        values={EMPHASIS_STYLES}
                        onChange={(emphasisStyle) => onChange({ emphasisStyle })}
                    />
                    <OptionSelect<LinkStyle>
                        label={t("linkStyleLabel")}
                        value={options.linkStyle}
                        items={linkItems}
                        values={LINK_STYLES}
                        onChange={(linkStyle) => onChange({ linkStyle })}
                    />
                </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <OptionSwitch
                    label={t("gfmLabel")}
                    hint={writesMarkdown ? t("gfmHintToMarkdown") : t("gfmHintToHtml")}
                    checked={options.gfm}
                    onCheckedChange={(gfm) => onChange({ gfm })}
                />

                {writesMarkdown ? (
                    <OptionSwitch
                        label={t("keepHtmlLabel")}
                        hint={t("keepHtmlHint")}
                        checked={options.keepUnsupportedHtml}
                        onCheckedChange={(keepUnsupportedHtml) => onChange({ keepUnsupportedHtml })}
                    />
                ) : (
                    <>
                        <OptionSwitch
                            label={t("lineBreaksLabel")}
                            hint={t("lineBreaksHint")}
                            checked={options.lineBreaks}
                            onCheckedChange={(lineBreaks) => onChange({ lineBreaks })}
                        />
                        <OptionSwitch
                            label={t("fullDocumentLabel")}
                            hint={t("fullDocumentHint")}
                            checked={options.fullDocument}
                            onCheckedChange={(fullDocument) => onChange({ fullDocument })}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
