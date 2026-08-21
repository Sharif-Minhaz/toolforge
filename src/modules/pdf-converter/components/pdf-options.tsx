"use client";

import { useTranslations } from "next-intl";

import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { PDF_FONT_SIZE_CHOICES } from "../domain/constants";
import { appliesTo } from "../domain/convert";
import {
    PDF_MARGINS,
    PDF_ORIENTATIONS,
    PDF_PAGE_SIZES,
    type PdfConverterOptions,
    type PdfMargin,
    type PdfOrientation,
    type PdfPageSize,
    type PdfSourceFormat,
} from "../types";

/**
 * Nine controls, three of which have nothing to decide for a deck and three of
 * which mean nothing for a workbook.
 *
 * A control that does not apply is **disabled with a reason**, never hidden.
 * Hiding it makes the panel change shape between two documents and leaves
 * somebody hunting for a switch they used yesterday; disabling it answers the
 * question instead. `appliesTo` in `domain/convert.ts` is the single predicate
 * behind that, shared with the article's options table and the tests.
 */

type PdfOptionsProps = {
    format: PdfSourceFormat;
    options: PdfConverterOptions;
    onChange: (patch: Partial<PdfConverterOptions>) => void;
};

export function PdfOptions({ format, options, onChange }: PdfOptionsProps) {
    const t = useTranslations("pdfConverter.workbench");

    const applies = (option: keyof PdfConverterOptions) => appliesTo(option, format);
    const slides = format === "pptx";

    const pageSizeItems = Object.fromEntries(
        PDF_PAGE_SIZES.map((size) => [size, t(`pageSizes.${size}`)]),
    );
    const orientationItems = Object.fromEntries(
        PDF_ORIENTATIONS.map((value) => [value, t(`orientations.${value}`)]),
    );
    const marginItems = Object.fromEntries(
        PDF_MARGINS.map((value) => [value, t(`margins.${value}`)]),
    );

    // Western digits on purpose: a point size mirrors machine input rather than
    // reading as prose, so it is not run through the locale's numerals.
    const fontSizeValues = PDF_FONT_SIZE_CHOICES.map(String);
    const fontSizeItems = Object.fromEntries(
        fontSizeValues.map((value) => [value, t("fontSizeUnit", { value })]),
    );

    /** The one sentence a dimmed control shows instead of its usual hint. */
    const inapplicable = (option: keyof PdfConverterOptions) => {
        if (slides) {
            return t("slidesFixedHint");
        }

        return option === "includeSpeakerNotes" ? t("slidesOnlyHint") : t("notForSheets");
    };

    return (
        <section className="flex flex-col gap-4" aria-label={t("optionsTitle")}>
            <h3 className="text-muted-foreground text-xs font-medium">{t("optionsTitle")}</h3>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <OptionSelect<PdfPageSize>
                    label={t("pageSizeLabel")}
                    hint={applies("pageSize") ? undefined : inapplicable("pageSize")}
                    value={options.pageSize}
                    items={pageSizeItems}
                    values={PDF_PAGE_SIZES}
                    disabled={!applies("pageSize")}
                    onChange={(pageSize) => onChange({ pageSize })}
                />

                <OptionSelect<PdfOrientation>
                    label={t("orientationLabel")}
                    hint={
                        applies("orientation")
                            ? options.orientation === "auto"
                                ? t("orientationAutoHint")
                                : undefined
                            : inapplicable("orientation")
                    }
                    value={options.orientation}
                    items={orientationItems}
                    values={PDF_ORIENTATIONS}
                    disabled={!applies("orientation")}
                    onChange={(orientation) => onChange({ orientation })}
                />

                <OptionSelect<PdfMargin>
                    label={t("marginLabel")}
                    hint={applies("margin") ? undefined : inapplicable("margin")}
                    value={options.margin}
                    items={marginItems}
                    values={PDF_MARGINS}
                    disabled={!applies("margin")}
                    onChange={(margin) => onChange({ margin })}
                />

                <OptionSelect<string>
                    label={t("fontSizeLabel")}
                    hint={applies("fontSize") ? t("fontSizeHint") : inapplicable("fontSize")}
                    value={String(options.fontSize)}
                    items={fontSizeItems}
                    values={fontSizeValues}
                    disabled={!applies("fontSize")}
                    onChange={(value) => onChange({ fontSize: Number(value) })}
                />
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
                <OptionSwitch
                    label={t("pageNumbersLabel")}
                    hint={t("pageNumbersHint")}
                    checked={options.pageNumbers}
                    onCheckedChange={(pageNumbers) => onChange({ pageNumbers })}
                />

                <OptionSwitch
                    label={t("includeImagesLabel")}
                    hint={
                        applies("includeImages")
                            ? t("includeImagesHint")
                            : inapplicable("includeImages")
                    }
                    checked={options.includeImages}
                    disabled={!applies("includeImages")}
                    onCheckedChange={(includeImages) => onChange({ includeImages })}
                />

                <OptionSwitch
                    label={t("showLinkUrlsLabel")}
                    hint={
                        applies("showLinkUrls")
                            ? t("showLinkUrlsHint")
                            : inapplicable("showLinkUrls")
                    }
                    checked={options.showLinkUrls}
                    disabled={!applies("showLinkUrls")}
                    onCheckedChange={(showLinkUrls) => onChange({ showLinkUrls })}
                />

                <OptionSwitch
                    label={t("repeatHeaderRowLabel")}
                    hint={
                        applies("repeatHeaderRow")
                            ? t("repeatHeaderRowHint")
                            : inapplicable("repeatHeaderRow")
                    }
                    checked={options.repeatHeaderRow}
                    disabled={!applies("repeatHeaderRow")}
                    onCheckedChange={(repeatHeaderRow) => onChange({ repeatHeaderRow })}
                />

                <OptionSwitch
                    label={t("includeSpeakerNotesLabel")}
                    hint={
                        applies("includeSpeakerNotes")
                            ? t("includeSpeakerNotesHint")
                            : inapplicable("includeSpeakerNotes")
                    }
                    checked={options.includeSpeakerNotes}
                    disabled={!applies("includeSpeakerNotes")}
                    onCheckedChange={(includeSpeakerNotes) => onChange({ includeSpeakerNotes })}
                />

                <OptionSwitch
                    label={t("separateSheetsLabel")}
                    hint={applies("separateSheets") ? t("separateSheetsHint") : t("sheetOnlyHint")}
                    checked={options.separateSheets}
                    disabled={!applies("separateSheets")}
                    onCheckedChange={(separateSheets) => onChange({ separateSheets })}
                />
            </div>
        </section>
    );
}
