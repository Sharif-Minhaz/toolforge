"use client";

import { IconX } from "@tabler/icons-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import {
    OptionsDisclosure,
    RESULT_TRAY,
    StepLabel,
} from "@/modules/tools/components/workbench-step";
import { copyText } from "@/modules/tools/domain/clipboard";
import {
    CURRENCY_FRACTION_DIGITS,
    CURRENCY_LABELS,
    MAX_FRACTION_DIGITS,
    MAX_INTEGER_DIGITS,
    MAX_NUMBER_INPUT_LENGTH,
} from "../domain/constants";
import { convertNumberToWords } from "../domain/convert";
import {
    CURRENCIES,
    ENGLISH_SCALES,
    LETTER_CASES,
    type NumberFormat,
    type NumberWordsFailure,
    type NumberWordsOptions,
} from "../types";
import { FormatSelector } from "./format-selector";
import { WordsLine } from "./words-line";

type Line = "english" | "bangla";

type NumberToWordsWorkbenchProps = {
    initialNumber: string;
    initialOptions: NumberWordsOptions;
};

export function NumberToWordsWorkbench({
    initialNumber,
    initialOptions,
}: NumberToWordsWorkbenchProps) {
    const t = useTranslations("numberToWords.workbench");
    const tErrors = useTranslations("numberToWords.errors");
    const tToast = useTranslations("numberToWords.toast");
    const formatter = useFormatter();
    const locale = useLocale();

    const inputId = useId();
    const hintId = useId();
    const statusId = useId();
    const formatLabelId = useId();

    const [number, setNumber] = useState(initialNumber);
    const [options, setOptions] = useState<NumberWordsOptions>(initialOptions);
    const [copied, markCopied] = useCopyFeedback<Line>();

    // Not capped: a number cut short by the field is a different number, and
    // on a cheque that is the worst outcome there is. The domain refuses past
    // the ceiling and the meter warns before it.
    const inputLimit = useInputLimit(number.length, MAX_NUMBER_INPUT_LENGTH);

    // The typed number settles; every option applies at once.
    const settledNumber = useDebouncedValue(number);
    const pending = settledNumber !== number;

    // Pure and deterministic, so the server-rendered pass already holds both lines.
    const result = convertNumberToWords(settledNumber, options);
    const isAmount = options.format === "currency";

    function patch(next: Partial<NumberWordsOptions>) {
        setOptions((current) => ({ ...current, ...next }));
    }

    function describeFailure(failure: NumberWordsFailure): string {
        const position = formatter.number(failure.position ?? 0);

        switch (failure.reason) {
            case "empty":
                return t("statusEmpty");
            case "invalid_character":
                return tErrors("invalidCharacter", { position });
            case "misplaced_sign":
                return tErrors("misplacedSign", { position });
            case "misplaced_separator":
                return tErrors("misplacedSeparator", { position });
            case "too_many_points":
                return tErrors("tooManyPoints", { position });
            case "no_digits":
                return tErrors("noDigits");
            case "too_many_digits":
                return tErrors("tooManyDigits", { max: formatter.number(MAX_INTEGER_DIGITS) });
            case "too_many_decimals":
                return isAmount
                    ? tErrors("tooManyDecimalsAmount", {
                          max: formatter.number(CURRENCY_FRACTION_DIGITS),
                      })
                    : tErrors("tooManyDecimals", { max: formatter.number(MAX_FRACTION_DIGITS) });
            case "negative_amount":
                return tErrors("negativeAmount");
        }
    }

    const status: { tone: StatusTone; message: string } = result.ok
        ? {
              tone: "success",
              message: t("statusReady", {
                  numeral: locale === "bn" ? result.banglaNumeral : result.numeral,
              }),
          }
        : {
              tone: result.reason === "empty" ? "idle" : "error",
              message: describeFailure(result),
          };

    async function handleCopy(line: Line) {
        if (!result.ok) {
            return;
        }

        const copiedText = await copyText(line === "english" ? result.english : result.bangla);

        if (!copiedText.ok) {
            const message =
                copiedText.reason === "empty"
                    ? tToast("copyFailedEmpty")
                    : copiedText.reason === "unsupported"
                      ? tToast("copyFailedUnsupported")
                      : tToast("copyFailedDenied");

            toast.error(message);

            return;
        }

        markCopied(line);
        toast.success(tToast("copied"));
    }

    const currencyItems = Object.fromEntries(
        CURRENCIES.map((currency) => [currency, CURRENCY_LABELS[currency]]),
    );
    const scaleItems = Object.fromEntries(
        ENGLISH_SCALES.map((scale) => [scale, t(`scales.${scale}`)]),
    );
    const letterCaseItems = Object.fromEntries(
        LETTER_CASES.map((letterCase) => [letterCase, t(`letterCases.${letterCase}`)]),
    );

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <Label id={formatLabelId} className="text-muted-foreground text-xs">
                            {t("formatLabel")}
                        </Label>
                        <FormatSelector
                            value={options.format}
                            labelId={formatLabelId}
                            onChange={(format: NumberFormat) => patch({ format })}
                        />
                        <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-[1.4]">
                            {t(`formatHints.${options.format}`)}
                        </p>
                    </div>

                    <OptionsDisclosure>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {/* Disabled rather than hidden for a cardinal: the
                                control stays where the reader learnt it is,
                                and its hint says why it is standing down. */}
                            <OptionSelect
                                label={t("currencyLabel")}
                                hint={isAmount ? t("currencyHint") : t("currencyHintUnavailable")}
                                value={options.currency}
                                items={currencyItems}
                                values={CURRENCIES}
                                disabled={!isAmount}
                                onChange={(currency) => patch({ currency })}
                            />
                            <OptionSelect
                                label={t("scaleLabel")}
                                hint={t("scaleHint")}
                                value={options.scale}
                                items={scaleItems}
                                values={ENGLISH_SCALES}
                                onChange={(scale) => patch({ scale })}
                            />
                            <OptionSelect
                                label={t("letterCaseLabel")}
                                hint={t("letterCaseHint")}
                                value={options.letterCase}
                                items={letterCaseItems}
                                values={LETTER_CASES}
                                onChange={(letterCase) => patch({ letterCase })}
                            />
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <OptionSwitch
                                label={t("britishAndLabel")}
                                hint={t("britishAndHint")}
                                checked={options.britishAnd}
                                onCheckedChange={(britishAnd) => patch({ britishAnd })}
                            />
                            <OptionSwitch
                                label={t("onlyLabel")}
                                hint={isAmount ? t("onlyHint") : t("onlyHintUnavailable")}
                                checked={options.appendOnly && isAmount}
                                disabled={!isAmount}
                                onCheckedChange={(appendOnly) => patch({ appendOnly })}
                            />
                        </div>
                    </OptionsDisclosure>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                        <StepLabel step={1} htmlFor={inputId}>
                            {t("inputLabel")}
                        </StepLabel>
                        <div className="flex items-center gap-1.5">
                            <InputLimitMeter reading={inputLimit} />
                            <button
                                type="button"
                                onClick={() => setNumber("")}
                                disabled={number.length === 0}
                                aria-label={t("clear")}
                                className={cn(
                                    buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                    "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    <Input
                        id={inputId}
                        value={number}
                        onChange={(event) => setNumber(event.target.value)}
                        placeholder={t("placeholder")}
                        inputMode="decimal"
                        spellCheck={false}
                        autoComplete="off"
                        aria-invalid={!result.ok && result.reason !== "empty"}
                        aria-describedby={`${hintId} ${statusId}`}
                        className="bg-card/70 h-12 rounded-xl font-mono text-lg tabular-nums"
                    />
                    <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("inputHint")}
                    </p>
                </div>

                <div className={RESULT_TRAY}>
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={2}>{t("outputLabel")}</StepLabel>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                        <WordsLine
                            label={t("englishLabel")}
                            copyLabel={t("copyEnglish")}
                            words={result.ok ? result.english : ""}
                            numeral={result.ok ? result.numeral : ""}
                            lang="en"
                            copied={copied === "english"}
                            dimmed={pending}
                            onCopy={() => handleCopy("english")}
                        />
                        <WordsLine
                            label={t("banglaLabel")}
                            copyLabel={t("copyBangla")}
                            words={result.ok ? result.bangla : ""}
                            numeral={result.ok ? result.banglaNumeral : ""}
                            lang="bn"
                            copied={copied === "bangla"}
                            dimmed={pending}
                            onCopy={() => handleCopy("bangla")}
                        />
                    </div>

                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        className={cn("transition-opacity duration-200", pending && "opacity-55")}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
