"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { MAX_PAYLOAD_LENGTH } from "../domain/constants";
import { WIFI_ENCRYPTIONS, type QrDraft, type QrPayloadKind, type WifiEncryption } from "../types";

/**
 * The fields for whichever kind is showing. Every kind writes into its own slice
 * of the one draft, so switching tabs never discards what was typed.
 */

type FieldProps = {
    label: string;
    hint?: string;
    children: (props: { id: string; describedBy: string | undefined }) => ReactNode;
};

function Field({ label, hint, children }: FieldProps) {
    const id = useId();
    const hintId = useId();

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{label}</span>
            </Label>
            {children({ id, describedBy: hint === undefined ? undefined : hintId })}
            {hint !== undefined && (
                <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {hint}
                </p>
            )}
        </div>
    );
}

type QrPayloadFieldsProps = {
    kind: QrPayloadKind;
    draft: QrDraft;
    /** Locked while a dynamic code owns the destination. */
    disabled?: boolean;
    onChange: (patch: Partial<QrDraft>) => void;
};

export function QrPayloadFields({ kind, draft, disabled, onChange }: QrPayloadFieldsProps) {
    const t = useTranslations("qr.workbench.fields");
    const tEncryption = useTranslations("qr.wifiEncryptions");

    switch (kind) {
        case "url":
            return (
                <Field label={t("url.label")} hint={t("url.hint")}>
                    {({ id, describedBy }) => (
                        <Input
                            id={id}
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            aria-describedby={describedBy}
                            disabled={disabled}
                            placeholder={t("url.placeholder")}
                            value={draft.url}
                            onChange={(event) => onChange({ url: event.target.value })}
                        />
                    )}
                </Field>
            );

        case "text":
            return (
                <Field label={t("text.label")} hint={t("text.hint")}>
                    {({ id, describedBy }) => (
                        <Textarea
                            id={id}
                            rows={4}
                            aria-describedby={describedBy}
                            placeholder={t("text.placeholder")}
                            maxLength={MAX_PAYLOAD_LENGTH}
                            value={draft.text}
                            onChange={(event) => onChange({ text: event.target.value })}
                        />
                    )}
                </Field>
            );

        case "wifi":
            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("wifi.ssid")} hint={t("wifi.ssidHint")}>
                        {({ id, describedBy }) => (
                            <Input
                                id={id}
                                aria-describedby={describedBy}
                                placeholder={t("wifi.ssidPlaceholder")}
                                value={draft.wifi.ssid}
                                onChange={(event) =>
                                    onChange({ wifi: { ...draft.wifi, ssid: event.target.value } })
                                }
                            />
                        )}
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t("wifi.password")}>
                            {({ id }) => (
                                <Input
                                    id={id}
                                    // Not `type="password"`: the value ends up in
                                    // a code anyone can scan, so hiding it on
                                    // screen protects nothing and only makes it
                                    // harder to check for typos.
                                    autoComplete="off"
                                    spellCheck={false}
                                    disabled={draft.wifi.encryption === "nopass"}
                                    placeholder={t("wifi.passwordPlaceholder")}
                                    value={draft.wifi.password}
                                    onChange={(event) =>
                                        onChange({
                                            wifi: { ...draft.wifi, password: event.target.value },
                                        })
                                    }
                                />
                            )}
                        </Field>

                        <OptionSelect<WifiEncryption>
                            label={t("wifi.encryption")}
                            value={draft.wifi.encryption}
                            values={WIFI_ENCRYPTIONS}
                            items={Object.fromEntries(
                                WIFI_ENCRYPTIONS.map((value) => [value, tEncryption(value)]),
                            )}
                            onChange={(encryption) =>
                                onChange({ wifi: { ...draft.wifi, encryption } })
                            }
                        />
                    </div>

                    <OptionSwitch
                        label={t("wifi.hidden")}
                        hint={t("wifi.hiddenHint")}
                        checked={draft.wifi.hidden}
                        onCheckedChange={(hidden) => onChange({ wifi: { ...draft.wifi, hidden } })}
                    />
                </div>
            );

        case "contact":
            return (
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("contact.fullName")}>
                        {({ id }) => (
                            <Input
                                id={id}
                                autoComplete="name"
                                placeholder={t("contact.fullNamePlaceholder")}
                                value={draft.contact.fullName}
                                onChange={(event) =>
                                    onChange({
                                        contact: {
                                            ...draft.contact,
                                            fullName: event.target.value,
                                        },
                                    })
                                }
                            />
                        )}
                    </Field>

                    <Field label={t("contact.organization")}>
                        {({ id }) => (
                            <Input
                                id={id}
                                autoComplete="organization"
                                placeholder={t("contact.organizationPlaceholder")}
                                value={draft.contact.organization}
                                onChange={(event) =>
                                    onChange({
                                        contact: {
                                            ...draft.contact,
                                            organization: event.target.value,
                                        },
                                    })
                                }
                            />
                        )}
                    </Field>

                    <Field label={t("contact.phone")}>
                        {({ id }) => (
                            <Input
                                id={id}
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                placeholder={t("contact.phonePlaceholder")}
                                value={draft.contact.phone}
                                onChange={(event) =>
                                    onChange({
                                        contact: { ...draft.contact, phone: event.target.value },
                                    })
                                }
                            />
                        )}
                    </Field>

                    <Field label={t("contact.email")}>
                        {({ id }) => (
                            <Input
                                id={id}
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                placeholder={t("contact.emailPlaceholder")}
                                value={draft.contact.email}
                                onChange={(event) =>
                                    onChange({
                                        contact: { ...draft.contact, email: event.target.value },
                                    })
                                }
                            />
                        )}
                    </Field>

                    <Field label={t("contact.url")}>
                        {({ id }) => (
                            <Input
                                id={id}
                                type="url"
                                inputMode="url"
                                placeholder={t("contact.urlPlaceholder")}
                                value={draft.contact.url}
                                onChange={(event) =>
                                    onChange({
                                        contact: { ...draft.contact, url: event.target.value },
                                    })
                                }
                            />
                        )}
                    </Field>

                    <Field label={t("contact.address")}>
                        {({ id }) => (
                            <Input
                                id={id}
                                autoComplete="street-address"
                                placeholder={t("contact.addressPlaceholder")}
                                value={draft.contact.address}
                                onChange={(event) =>
                                    onChange({
                                        contact: { ...draft.contact, address: event.target.value },
                                    })
                                }
                            />
                        )}
                    </Field>
                </div>
            );

        case "sms":
            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("sms.phone")}>
                        {({ id }) => (
                            <Input
                                id={id}
                                type="tel"
                                inputMode="tel"
                                placeholder={t("sms.phonePlaceholder")}
                                value={draft.sms.phone}
                                onChange={(event) =>
                                    onChange({ sms: { ...draft.sms, phone: event.target.value } })
                                }
                            />
                        )}
                    </Field>

                    <Field label={t("sms.message")}>
                        {({ id }) => (
                            <Textarea
                                id={id}
                                rows={3}
                                placeholder={t("sms.messagePlaceholder")}
                                maxLength={MAX_PAYLOAD_LENGTH}
                                value={draft.sms.message}
                                onChange={(event) =>
                                    onChange({ sms: { ...draft.sms, message: event.target.value } })
                                }
                            />
                        )}
                    </Field>
                </div>
            );

        case "email":
            return (
                <div className="flex flex-col gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t("email.address")}>
                            {({ id }) => (
                                <Input
                                    id={id}
                                    type="email"
                                    inputMode="email"
                                    placeholder={t("email.addressPlaceholder")}
                                    value={draft.email.address}
                                    onChange={(event) =>
                                        onChange({
                                            email: {
                                                ...draft.email,
                                                address: event.target.value,
                                            },
                                        })
                                    }
                                />
                            )}
                        </Field>

                        <Field label={t("email.subject")}>
                            {({ id }) => (
                                <Input
                                    id={id}
                                    placeholder={t("email.subjectPlaceholder")}
                                    value={draft.email.subject}
                                    onChange={(event) =>
                                        onChange({
                                            email: {
                                                ...draft.email,
                                                subject: event.target.value,
                                            },
                                        })
                                    }
                                />
                            )}
                        </Field>
                    </div>

                    <Field label={t("email.body")}>
                        {({ id }) => (
                            <Textarea
                                id={id}
                                rows={3}
                                placeholder={t("email.bodyPlaceholder")}
                                maxLength={MAX_PAYLOAD_LENGTH}
                                value={draft.email.body}
                                onChange={(event) =>
                                    onChange({
                                        email: { ...draft.email, body: event.target.value },
                                    })
                                }
                            />
                        )}
                    </Field>
                </div>
            );

        case "phone":
            return (
                <Field label={t("phone.number")} hint={t("phone.hint")}>
                    {({ id, describedBy }) => (
                        <Input
                            id={id}
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            aria-describedby={describedBy}
                            placeholder={t("phone.placeholder")}
                            value={draft.phone.number}
                            onChange={(event) =>
                                onChange({ phone: { number: event.target.value } })
                            }
                        />
                    )}
                </Field>
            );
    }
}
