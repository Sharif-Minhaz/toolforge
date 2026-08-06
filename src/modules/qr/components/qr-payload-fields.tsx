"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { MAX_FIELD_LENGTH, MAX_PAYLOAD_LENGTH, MAX_WIFI_FIELD_LENGTH } from "../domain/constants";
import { WIFI_ENCRYPTIONS, type QrDraft, type QrPayloadKind, type WifiEncryption } from "../types";

/**
 * The fields for whichever kind is showing. Every kind writes into its own slice
 * of the one draft, so switching tabs never discards what was typed.
 */

type FieldProps = {
    label: string;
    hint?: string;
    /** The field's own value and ceiling. The wrapper owns both the countdown
     *  and the `maxLength` it hands down, so a field cannot cap at one number
     *  while its meter counts against another. */
    value: string;
    limit: number;
    children: (props: {
        id: string;
        describedBy: string | undefined;
        maxLength: number;
    }) => ReactNode;
};

function Field({ label, hint, value, limit, children }: FieldProps) {
    const id = useId();
    const hintId = useId();
    const reading = useInputLimit(value.length, limit);

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={id} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{label}</span>
                </Label>
                <InputLimitMeter reading={reading} />
            </div>
            {children({
                id,
                describedBy: hint === undefined ? undefined : hintId,
                maxLength: limit,
            })}
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
                <Field
                    label={t("url.label")}
                    hint={t("url.hint")}
                    value={draft.url}
                    limit={MAX_FIELD_LENGTH}
                >
                    {({ id, describedBy, maxLength }) => (
                        <Input
                            id={id}
                            maxLength={maxLength}
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
                <Field
                    label={t("text.label")}
                    hint={t("text.hint")}
                    value={draft.text}
                    limit={MAX_PAYLOAD_LENGTH}
                >
                    {({ id, describedBy, maxLength }) => (
                        <Textarea
                            id={id}
                            maxLength={maxLength}
                            rows={4}
                            aria-describedby={describedBy}
                            placeholder={t("text.placeholder")}
                            value={draft.text}
                            onChange={(event) => onChange({ text: event.target.value })}
                        />
                    )}
                </Field>
            );

        case "wifi":
            return (
                <div className="flex flex-col gap-3">
                    <Field
                        label={t("wifi.ssid")}
                        hint={t("wifi.ssidHint")}
                        value={draft.wifi.ssid}
                        limit={MAX_WIFI_FIELD_LENGTH}
                    >
                        {({ id, describedBy, maxLength }) => (
                            <Input
                                id={id}
                                maxLength={maxLength}
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
                        <Field
                            label={t("wifi.password")}
                            value={draft.wifi.password}
                            limit={MAX_WIFI_FIELD_LENGTH}
                        >
                            {({ id, maxLength }) => (
                                <Input
                                    id={id}
                                    maxLength={maxLength}
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
                    <Field
                        label={t("contact.fullName")}
                        value={draft.contact.fullName}
                        limit={MAX_FIELD_LENGTH}
                    >
                        {({ id, maxLength }) => (
                            <Input
                                id={id}
                                maxLength={maxLength}
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

                    <Field
                        label={t("contact.organization")}
                        value={draft.contact.organization}
                        limit={MAX_FIELD_LENGTH}
                    >
                        {({ id, maxLength }) => (
                            <Input
                                id={id}
                                maxLength={maxLength}
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

                    <Field
                        label={t("contact.phone")}
                        value={draft.contact.phone}
                        limit={MAX_FIELD_LENGTH}
                    >
                        {({ id, maxLength }) => (
                            <Input
                                id={id}
                                maxLength={maxLength}
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

                    <Field
                        label={t("contact.email")}
                        value={draft.contact.email}
                        limit={MAX_FIELD_LENGTH}
                    >
                        {({ id, maxLength }) => (
                            <Input
                                id={id}
                                maxLength={maxLength}
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

                    <Field
                        label={t("contact.url")}
                        value={draft.contact.url}
                        limit={MAX_FIELD_LENGTH}
                    >
                        {({ id, maxLength }) => (
                            <Input
                                id={id}
                                maxLength={maxLength}
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

                    <Field
                        label={t("contact.address")}
                        value={draft.contact.address}
                        limit={MAX_FIELD_LENGTH}
                    >
                        {({ id, maxLength }) => (
                            <Input
                                id={id}
                                maxLength={maxLength}
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
                    <Field label={t("sms.phone")} value={draft.sms.phone} limit={MAX_FIELD_LENGTH}>
                        {({ id, maxLength }) => (
                            <Input
                                id={id}
                                maxLength={maxLength}
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

                    <Field
                        label={t("sms.message")}
                        value={draft.sms.message}
                        limit={MAX_PAYLOAD_LENGTH}
                    >
                        {({ id, maxLength }) => (
                            <Textarea
                                id={id}
                                maxLength={maxLength}
                                rows={3}
                                placeholder={t("sms.messagePlaceholder")}
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
                        <Field
                            label={t("email.address")}
                            value={draft.email.address}
                            limit={MAX_FIELD_LENGTH}
                        >
                            {({ id, maxLength }) => (
                                <Input
                                    id={id}
                                    maxLength={maxLength}
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

                        <Field
                            label={t("email.subject")}
                            value={draft.email.subject}
                            limit={MAX_FIELD_LENGTH}
                        >
                            {({ id, maxLength }) => (
                                <Input
                                    id={id}
                                    maxLength={maxLength}
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

                    <Field
                        label={t("email.body")}
                        value={draft.email.body}
                        limit={MAX_PAYLOAD_LENGTH}
                    >
                        {({ id, maxLength }) => (
                            <Textarea
                                id={id}
                                maxLength={maxLength}
                                rows={3}
                                placeholder={t("email.bodyPlaceholder")}
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
                <Field
                    label={t("phone.number")}
                    hint={t("phone.hint")}
                    value={draft.phone.number}
                    limit={MAX_FIELD_LENGTH}
                >
                    {({ id, describedBy, maxLength }) => (
                        <Input
                            id={id}
                            maxLength={maxLength}
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
