import { z } from "zod";

import {
    DEFAULT_BACKGROUND,
    DEFAULT_FOREGROUND,
    DEFAULT_MARGIN,
    DEFAULT_PIXEL_SIZE,
    MAX_FIELD_LENGTH,
    MAX_PAYLOAD_LENGTH,
    MAX_WIFI_FIELD_LENGTH,
} from "@/modules/qr/domain/constants";
import { encodeQr } from "@/modules/qr/domain/encoder";
import { buildPayloadText } from "@/modules/qr/domain/payload";
import { renderQrSvg } from "@/modules/qr/domain/render-svg";
import {
    QR_DOT_STYLES,
    QR_ERROR_LEVELS,
    QR_EYE_STYLES,
    WIFI_ENCRYPTIONS,
} from "@/modules/qr/types";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * A QR code as SVG, from the site's own ISO/IEC 18004 encoder.
 *
 * SVG rather than PNG: rasterising needs a canvas, which is a browser API, and
 * an SVG is text — so it survives a JSON tool result intact and the caller can
 * write it to a file or embed it directly.
 *
 * The structured payloads are the reason this takes more than a string. A Wi-Fi
 * code is `WIFI:T:WPA;S:name;P:secret;;` with escaping rules for the characters
 * a password is likely to contain, and a caller composing that by hand gets it
 * wrong in a way that only shows up when a phone refuses to join the network.
 */
const wifiSchema = z.object({
    ssid: z.string().max(MAX_WIFI_FIELD_LENGTH),
    password: z.string().max(MAX_WIFI_FIELD_LENGTH).default(""),
    encryption: z.enum(WIFI_ENCRYPTIONS).default("WPA"),
    hidden: z.boolean().default(false),
});

const contactSchema = z.object({
    fullName: z.string().max(MAX_FIELD_LENGTH),
    phone: z.string().max(MAX_FIELD_LENGTH).default(""),
    email: z.string().max(MAX_FIELD_LENGTH).default(""),
    organization: z.string().max(MAX_FIELD_LENGTH).default(""),
    url: z.string().max(MAX_FIELD_LENGTH).default(""),
    address: z.string().max(MAX_FIELD_LENGTH).default(""),
});

export const qrGenerateTool = defineMcpTool({
    toolId: "qr",
    verb: "generate",
    title: "Generate a QR code",
    description:
        "Encode a URL, plain text, Wi-Fi credentials, a vCard contact, an SMS, an email or a phone number as a QR code, returned as SVG markup. Pick the error-correction level by how the code will be used: L for a clean screen, H when it will be printed small or partly covered. Returns the module matrix size and version alongside the SVG.",
    kind: "offline",
    inputSchema: z.object({
        kind: z
            .enum(["url", "text", "wifi", "contact", "sms", "email", "phone"])
            .default("text")
            .describe("Which payload the code carries"),
        text: z
            .string()
            .max(MAX_PAYLOAD_LENGTH)
            .default("")
            .describe("Used by `text`; the URL for `url`; the number for `phone`"),
        wifi: wifiSchema.optional().describe("Required when `kind` is `wifi`"),
        contact: contactSchema.optional().describe("Required when `kind` is `contact`"),
        smsMessage: z.string().max(MAX_FIELD_LENGTH).default("").describe("Body for `sms`"),
        smsPhone: z.string().max(MAX_FIELD_LENGTH).default("").describe("Recipient for `sms`"),
        emailAddress: z.string().max(MAX_FIELD_LENGTH).default(""),
        emailSubject: z.string().max(MAX_FIELD_LENGTH).default(""),
        emailBody: z.string().max(MAX_FIELD_LENGTH).default(""),
        level: z
            .enum(QR_ERROR_LEVELS)
            .default("M")
            .describe("Error correction: L ~7%, M ~15%, Q ~25%, H ~30% recoverable"),
        foreground: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .default(DEFAULT_FOREGROUND),
        background: z
            .string()
            .regex(/^(#[0-9a-fA-F]{6}|transparent)$/)
            .default(DEFAULT_BACKGROUND),
        dotStyle: z.enum(QR_DOT_STYLES).default("square"),
        eyeStyle: z.enum(QR_EYE_STYLES).default("square"),
        margin: z
            .number()
            .int()
            .min(0)
            .max(16)
            .default(DEFAULT_MARGIN)
            .describe("Quiet zone in modules. Four is the specification's minimum"),
        pixelSize: z
            .number()
            .int()
            .min(64)
            .max(4_096)
            .default(DEFAULT_PIXEL_SIZE)
            .describe("Written into the SVG's width and height"),
    }),
    run: (input) => {
        const payload = buildPayload(input);
        const encoded = encodeQr(payload, input.level);

        if (!encoded.ok) {
            return refuseWithReason("QR encoder", encoded.reason, {
                payloadLength: payload.length,
                maxPayloadLength: MAX_PAYLOAD_LENGTH,
            });
        }

        const svg = renderQrSvg(
            encoded.matrix,
            {
                foreground: input.foreground,
                background: input.background,
                dotStyle: input.dotStyle,
                eyeStyle: input.eyeStyle,
                margin: input.margin,
                // A logo has to arrive as a data URL and would have to be
                // fetched or decoded here; the page owns that, this does not.
                logo: null,
            },
            { pixelSize: input.pixelSize },
        );

        return succeed(
            `QR version ${encoded.matrix.version}, ${encoded.matrix.size}×${encoded.matrix.size} modules, level ${encoded.matrix.level}`,
            {
                svg,
                payload,
                version: encoded.matrix.version,
                size: encoded.matrix.size,
                level: encoded.matrix.level,
                mask: encoded.matrix.mask,
            },
        );
    },
});

/** The typed fields, assembled into the string the encoder actually takes. */
function buildPayload(input: {
    kind: "url" | "text" | "wifi" | "contact" | "sms" | "email" | "phone";
    text: string;
    wifi?: z.output<typeof wifiSchema>;
    contact?: z.output<typeof contactSchema>;
    smsPhone: string;
    smsMessage: string;
    emailAddress: string;
    emailSubject: string;
    emailBody: string;
}): string {
    switch (input.kind) {
        case "url":
            return buildPayloadText({ kind: "url", url: input.text });
        case "wifi":
            return input.wifi === undefined
                ? ""
                : buildPayloadText({ kind: "wifi", ...input.wifi });
        case "contact":
            return input.contact === undefined
                ? ""
                : buildPayloadText({ kind: "contact", ...input.contact });
        case "sms":
            return buildPayloadText({
                kind: "sms",
                phone: input.smsPhone,
                message: input.smsMessage,
            });
        case "email":
            return buildPayloadText({
                kind: "email",
                address: input.emailAddress,
                subject: input.emailSubject,
                body: input.emailBody,
            });
        case "phone":
            return buildPayloadText({ kind: "phone", number: input.text });
        default:
            return buildPayloadText({ kind: "text", text: input.text });
    }
}
