import {
    PRIVACY_FINDINGS,
    TAG_GROUPS,
    type GpsPosition,
    type MetadataBlocks,
    type PhotoFacts,
    type PrivacyFinding,
    type ReadResult,
    type TagEntry,
    type TagGroup,
    type TagGroupId,
    type TagValue,
} from "../types";
import { MAX_PHOTO_BYTES, MAX_TAG_TEXT_LENGTH } from "./constants";
import { detectPhotoFormat } from "./format";
import { readJpegComments } from "./jpeg";
import { EXIF_HEADER } from "./tiff";
import { webpBlocks } from "./webp";

type RawGroups = Partial<Record<string, Record<string, unknown>>>;

/** Asked for everything, raw: no `Date` objects, because a camera's clock has no zone and a `Date` would invent one. */
const PARSE_OPTIONS = {
    tiff: true,
    exif: true,
    gps: true,
    ifd1: true,
    interop: true,
    xmp: true,
    iptc: true,
    icc: true,
    jfif: true,
    ihdr: true,
    makerNote: false,
    userComment: true,
    mergeOutput: false,
    translateKeys: true,
    translateValues: true,
    reviveValues: false,
    sanitize: true,
} as const;

const MAX_SEGMENT_PAYLOAD = 0xffff - 2;
const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const ICC_HEADER = "ICC_PROFILE\0";
const ICC_CHUNK = MAX_SEGMENT_PAYLOAD - ICC_HEADER.length - 2;

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
    const segment = new Uint8Array(4 + payload.length);
    const length = payload.length + 2;

    segment.set([0xff, marker, length >> 8, length & 0xff]);
    segment.set(payload, 4);

    return segment;
}

function withPrefix(prefix: string | Uint8Array, body: Uint8Array): Uint8Array {
    const head = typeof prefix === "string" ? new TextEncoder().encode(prefix) : prefix;
    const out = new Uint8Array(head.length + body.length);

    out.set(head);
    out.set(body, head.length);

    return out;
}

/**
 * The parser reads JPEG, PNG, HEIC, AVIF and TIFF, but not WebP. Rather than a
 * second parser for one container, a WebP's blocks are re-wrapped as the
 * segments of an image-less JPEG — EXIF in APP1, XMP in APP1, the ICC profile
 * split across APP2 — which the parser reads the same way it reads any JPEG.
 * Nothing is decoded, so there being no picture inside does not matter.
 */
export function blocksAsJpeg(blocks: MetadataBlocks): Uint8Array {
    const segments: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];

    if (blocks.tiff !== null && blocks.tiff.length + EXIF_HEADER.length <= MAX_SEGMENT_PAYLOAD) {
        segments.push(jpegSegment(0xe1, withPrefix(EXIF_HEADER, blocks.tiff)));
    }

    if (blocks.xmp !== null && blocks.xmp.length + XMP_HEADER.length <= MAX_SEGMENT_PAYLOAD) {
        segments.push(jpegSegment(0xe1, withPrefix(XMP_HEADER, blocks.xmp)));
    }

    if (blocks.icc !== null) {
        const total = Math.ceil(blocks.icc.length / ICC_CHUNK);

        for (let index = 0; index < total; index++) {
            const chunk = blocks.icc.subarray(index * ICC_CHUNK, (index + 1) * ICC_CHUNK);
            const head = withPrefix(ICC_HEADER, new Uint8Array([index + 1, total]));

            segments.push(jpegSegment(0xe2, withPrefix(head, chunk)));
        }
    }

    segments.push(new Uint8Array([0xff, 0xd9]));

    const out = new Uint8Array(segments.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;

    for (const segment of segments) {
        out.set(segment, offset);
        offset += segment.length;
    }

    return out;
}

function toValue(raw: unknown): TagValue | null {
    if (raw === null || raw === undefined) {
        return null;
    }

    if (raw instanceof Uint8Array || raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
        return { kind: "bytes", length: raw.byteLength };
    }

    let text: string;

    if (typeof raw === "string") {
        text = raw.replace(/\0+$/, "").trim();
    } else if (typeof raw === "number" || typeof raw === "boolean" || typeof raw === "bigint") {
        text = String(raw);
    } else if (
        Array.isArray(raw) &&
        raw.every((item) => typeof item !== "object" || item === null)
    ) {
        text = raw.map(String).join(", ");
    } else {
        text = JSON.stringify(raw) ?? "";
    }

    if (text.length === 0) {
        return null;
    }

    return {
        kind: "text",
        text: text.length > MAX_TAG_TEXT_LENGTH ? `${text.slice(0, MAX_TAG_TEXT_LENGTH)}…` : text,
    };
}

function toGroups(raw: RawGroups, comments: readonly string[]): TagGroup[] {
    return TAG_GROUPS.flatMap((id: TagGroupId): TagGroup[] => {
        if (id === "comment") {
            return comments.length === 0
                ? []
                : [
                      {
                          id,
                          tags: comments.map((text) => ({
                              key: "Comment",
                              value: { kind: "text" as const, text },
                          })),
                      },
                  ];
        }

        const block = raw[id];

        if (block === undefined || block === null || typeof block !== "object") {
            return [];
        }

        const tags: TagEntry[] = Object.entries(block).flatMap(([key, value]) => {
            const converted = toValue(value);

            return converted === null ? [] : [{ key, value: converted }];
        });

        return tags.length === 0 ? [] : [{ id, tags }];
    });
}

function text(value: unknown): string | null {
    if (typeof value === "string") {
        const trimmed = value.replace(/\0+$/, "").trim();

        return trimmed.length > 0 ? trimmed : null;
    }

    if (typeof value === "number") {
        return String(value);
    }

    if (Array.isArray(value) && value.length > 0) {
        return value.map(String).join(", ");
    }

    return null;
}

function number(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `[23, 48, 36]` and `"N"` → 23.81. A reference of S or W turns it negative. */
function degrees(value: unknown, reference: unknown): number | null {
    const parts = Array.isArray(value) ? value.map(number) : [number(value)];

    if (parts.length === 0 || parts.some((part) => part === null)) {
        return null;
    }

    const [whole, minutes = 0, seconds = 0] = parts as number[];
    const magnitude = whole + minutes / 60 + seconds / 3600;
    const ref = typeof reference === "string" ? reference.trim().toUpperCase() : "";

    return ref.startsWith("S") || ref.startsWith("W") ? -magnitude : magnitude;
}

function position(gps: Record<string, unknown> | undefined): GpsPosition | null {
    if (gps === undefined) {
        return null;
    }

    const latitude = degrees(gps.GPSLatitude, gps.GPSLatitudeRef);
    const longitude = degrees(gps.GPSLongitude, gps.GPSLongitudeRef);

    if (latitude === null || longitude === null || (latitude === 0 && longitude === 0)) {
        return null;
    }

    const altitude = number(gps.GPSAltitude);
    const below =
        gps.GPSAltitudeRef === 1 ||
        (typeof gps.GPSAltitudeRef === "string" && /below/i.test(gps.GPSAltitudeRef));

    return {
        latitude,
        longitude,
        altitude: altitude === null ? null : below ? -altitude : altitude,
    };
}

/** `2024:05:01 14:30:15` and `+06:00` → `2024-05-01 14:30:15 +06:00`, as written, never re-zoned. */
function cameraTime(value: unknown, offset: unknown): string | null {
    const raw = text(value);

    if (raw === null) {
        return null;
    }

    const normalised = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    const zone = text(offset);

    return zone === null ? normalised : `${normalised} ${zone}`;
}

function exposure(seconds: number | null): string | null {
    if (seconds === null || seconds <= 0) {
        return null;
    }

    return seconds >= 1 ? `${Number(seconds.toFixed(1))} s` : `1/${Math.round(1 / seconds)} s`;
}

function facts(raw: RawGroups): PhotoFacts {
    const ifd0 = raw.ifd0 ?? {};
    const exif = raw.exif ?? {};
    const iptc = raw.iptc ?? {};
    const xmp = raw.xmp ?? {};

    const fNumber = number(exif.FNumber);
    const focal = number(exif.FocalLength);
    const iso = number(exif.ISO) ?? number(exif.ISOSpeedRatings);

    const serialNumbers = [
        exif.BodySerialNumber,
        exif.LensSerialNumber,
        exif.SerialNumber,
        ifd0.CameraSerialNumber,
    ]
        .map(text)
        .filter((value): value is string => value !== null);
    const people = [
        ifd0.Artist,
        ifd0.Copyright,
        exif.CameraOwnerName,
        exif.OwnerName,
        iptc.Byline,
        xmp.creator,
        xmp.Creator,
    ]
        .map(text)
        .filter((value): value is string => value !== null);

    return {
        make: text(ifd0.Make),
        model: text(ifd0.Model),
        lens: text(exif.LensModel) ?? text(exif.LensMake),
        software: text(ifd0.Software) ?? text(xmp.CreatorTool),
        takenAt:
            cameraTime(exif.DateTimeOriginal, exif.OffsetTimeOriginal) ??
            cameraTime(exif.CreateDate, exif.OffsetTimeDigitized) ??
            cameraTime(ifd0.ModifyDate, exif.OffsetTime),
        exposure: exposure(number(exif.ExposureTime)),
        aperture: fNumber === null ? null : `f/${Number(fNumber.toFixed(1))}`,
        iso: iso === null ? null : `ISO ${iso}`,
        focalLength: focal === null ? null : `${Number(focal.toFixed(1))} mm`,
        orientation: text(ifd0.Orientation),
        location: position(raw.gps),
        serialNumbers: [...new Set(serialNumbers)],
        people: [...new Set(people)],
    };
}

function findings(
    found: PhotoFacts,
    groups: readonly TagGroup[],
    raw: RawGroups,
): PrivacyFinding[] {
    const ifd1 = raw.ifd1 ?? {};
    const exif = raw.exif ?? {};
    const hasThumbnail =
        (number(ifd1.ThumbnailLength) ?? number(ifd1.JPEGInterchangeFormatLength) ?? 0) > 0;
    const hasComment =
        groups.some((group) => group.id === "comment") ||
        text(exif.UserComment) !== null ||
        text(raw.ifd0?.ImageDescription) !== null;

    const present: Readonly<Record<PrivacyFinding, boolean>> = {
        location: found.location !== null,
        people: found.people.length > 0,
        serial: found.serialNumbers.length > 0,
        thumbnail: hasThumbnail,
        time: found.takenAt !== null,
        device: found.make !== null || found.model !== null,
        software: found.software !== null,
        comment: hasComment,
    };

    return PRIVACY_FINDINGS.filter((finding) => present[finding]);
}

/**
 * The one entry point the island and the MCP adapter call to read a photo:
 * every tag, grouped, plus the facts and the privacy findings drawn from them.
 * The parser is loaded on first use, so the page does not carry it until a
 * photo is chosen.
 */
export async function readPhotoMetadata(bytes: Uint8Array): Promise<ReadResult> {
    if (bytes.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (bytes.length > MAX_PHOTO_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    const format = detectPhotoFormat(bytes);

    if (format === null) {
        return { ok: false, reason: "unsupported_format" };
    }

    let source: Uint8Array = bytes;

    if (format === "webp") {
        const blocks = webpBlocks(bytes);

        if (blocks === null) {
            return { ok: false, reason: "unreadable" };
        }

        source = blocksAsJpeg(blocks);
    }

    let raw: RawGroups;

    try {
        const { default: exifr } = await import("exifr");

        raw = ((await exifr.parse(source, PARSE_OPTIONS)) as RawGroups | undefined) ?? {};
    } catch {
        // The parser throws on a damaged block; the refusal is the answer.
        return { ok: false, reason: "unreadable" };
    }

    const comments = format === "jpeg" ? readJpegComments(bytes) : [];
    const groups = toGroups(raw, comments);
    const found = facts(raw);

    return {
        ok: true,
        format,
        groups,
        facts: found,
        findings: findings(found, groups, raw),
        tagCount: groups.reduce((sum, group) => sum + group.tags.length, 0),
    };
}
