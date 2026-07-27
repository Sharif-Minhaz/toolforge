"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { getKeyFormat, isSecretTooShort } from "../domain/algorithms";
import { measureSecretBytes } from "../domain/keys";
import type { JwtAlgorithm, JwtKeyInput } from "../types";

type KeyFieldProps = {
    algorithm: JwtAlgorithm;
    value: JwtKeyInput;
    onChange: (value: JwtKeyInput) => void;
    /** Decides whether the PEM box asks for a public or a private key. */
    purpose: "verification" | "signing";
    copied: boolean;
    onCopy: () => void;
};

/**
 * The one control that changes shape with the algorithm: a shared secret for
 * HMAC, a PEM block for everything else. Switching family swaps the box rather
 * than leaving a secret sitting where a key belongs.
 */
export function KeyField({ algorithm, value, onChange, purpose, copied, onCopy }: KeyFieldProps) {
    const t = useTranslations("jwt.workbench.key");
    const fieldId = useId();
    const toggleLabelId = useId();
    const toggleHintId = useId();

    const usesSecret = getKeyFormat(algorithm) === "secret";
    const secret = value.kind === "secret" ? value : null;
    const pem = value.kind === "pem" ? value.pem : "";

    const label = usesSecret
        ? t("secretLabel")
        : purpose === "signing"
          ? t("privateKeyLabel")
          : t("publicKeyLabel");

    const placeholder = usesSecret
        ? t("secretPlaceholder")
        : purpose === "signing"
          ? t("privateKeyPlaceholder")
          : t("publicKeyPlaceholder");

    const secretBytes = secret === null ? 0 : measureSecretBytes(secret);
    const weak = usesSecret && isSecretTooShort(algorithm, secretBytes);

    return (
        <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={fieldId} className="text-muted-foreground min-w-0 text-xs">
                    <span className="truncate leading-[1.3]">{label}</span>
                </Label>
                <IconCopyButton copied={copied} onClick={onCopy} aria-label={t("copy")} />
            </div>

            {usesSecret ? (
                <Textarea
                    id={fieldId}
                    value={secret?.secret ?? ""}
                    placeholder={placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    onChange={(event) =>
                        onChange({
                            kind: "secret",
                            secret: event.target.value,
                            base64url: secret?.base64url ?? false,
                        })
                    }
                    className="bg-background/60 max-h-40 min-h-16 resize-y rounded-lg font-mono text-[0.8125rem] leading-6 break-all"
                />
            ) : (
                <Textarea
                    id={fieldId}
                    value={pem}
                    placeholder={placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    onChange={(event) => onChange({ kind: "pem", pem: event.target.value })}
                    className="bg-background/60 max-h-56 min-h-28 resize-y rounded-lg font-mono text-[0.75rem] leading-5 break-all"
                />
            )}

            {usesSecret && (
                <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-col gap-0.5">
                        <span
                            id={toggleLabelId}
                            className="text-[0.8125rem] leading-[1.3] font-medium"
                        >
                            {t("base64urlLabel")}
                        </span>
                        <span
                            id={toggleHintId}
                            className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                        >
                            {t("base64urlHint")}
                        </span>
                    </span>
                    <Switch
                        checked={secret?.base64url ?? false}
                        onCheckedChange={(base64url) =>
                            onChange({
                                kind: "secret",
                                secret: secret?.secret ?? "",
                                base64url,
                            })
                        }
                        aria-labelledby={toggleLabelId}
                        aria-describedby={toggleHintId}
                        className="mt-1 shrink-0"
                    />
                </div>
            )}

            {weak && (
                <p className="text-brand-amber text-[0.6875rem] leading-[1.4]">
                    {t("shortSecret", { algorithm })}
                </p>
            )}
        </div>
    );
}
