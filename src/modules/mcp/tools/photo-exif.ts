import { z } from "zod";

import { DEFAULT_STRIP_OPTIONS, MAX_MCP_PHOTO_BYTES } from "@/modules/photo-exif/domain/constants";
import { readPhotoMetadata } from "@/modules/photo-exif/domain/read";
import { stripPhoto } from "@/modules/photo-exif/domain/strip";
import { photoBase64Schema } from "@/modules/photo-exif/validation/photo-exif";
import { base64ToBytes, bytesToBase64 } from "@/modules/tools/domain/base64";
import type { JsonValue } from "@/modules/tools/types/json-document";

import { defineMcpTool } from "../domain/define-tool";
import { refuse, refuseWithReason, succeed } from "../domain/result";

/**
 * The Photo EXIF tool, for a caller with no file picker: the photo arrives
 * Base64-encoded. Both calls run the same domain functions the page runs —
 * the reader through the same tag parser, the stripper through the same
 * byte-level rewrite — and nothing is kept after the call returns.
 */

const photoArgument = photoBase64Schema.describe(
    "The photo file, Base64-encoded: JPEG, PNG, WebP, HEIC, AVIF or TIFF. At most 1 MiB once decoded",
);

function decode(encoded: string) {
    const bytes = base64ToBytes(encoded);

    if (bytes === null) {
        return {
            ok: false as const,
            outcome: refuse("invalid_base64", "The `photo` argument is not valid Base64."),
        };
    }

    if (bytes.length > MAX_MCP_PHOTO_BYTES) {
        return {
            ok: false as const,
            outcome: refuseWithReason("Photo EXIF", "too_large", {
                bytes: bytes.length,
                limit: MAX_MCP_PHOTO_BYTES,
            }),
        };
    }

    return { ok: true as const, bytes };
}

export const photoExifReadTool = defineMcpTool({
    toolId: "photo-exif",
    verb: "read",
    title: "Read a photo's EXIF, GPS, XMP and IPTC metadata",
    description:
        "Read every metadata tag in a photo — EXIF (camera, lens, exposure, the date as the camera wrote it), GPS position, XMP, IPTC, the ICC profile and JPEG comments — and list what in it identifies a person, a place or a device: `location`, `people` (artist, owner, by-line), `serial` (body and lens serial numbers), `thumbnail` (an embedded preview that can show the uncropped original), `time`, `device`, `software`, `comment`. Reads JPEG, PNG, WebP, HEIC, AVIF and TIFF, recognised from the bytes rather than a file name.",
    kind: "offline",
    inputSchema: z.object({ photo: photoArgument }),
    run: async ({ photo }) => {
        const decoded = decode(photo);

        if (!decoded.ok) {
            return decoded.outcome;
        }

        const result = await readPhotoMetadata(decoded.bytes);

        if (!result.ok) {
            return refuseWithReason("Photo EXIF", result.reason);
        }

        const groups: Record<string, JsonValue> = Object.fromEntries(
            result.groups.map((group) => [
                group.id,
                Object.fromEntries(
                    group.tags.map((tag) => [
                        tag.key,
                        tag.value.kind === "text" ? tag.value.text : `<${tag.value.length} bytes>`,
                    ]),
                ),
            ]),
        );

        return succeed(
            `${result.format.toUpperCase()}, ${result.tagCount} tags; identifying: ${result.findings.join(", ") || "nothing"}`,
            {
                format: result.format,
                findings: [...result.findings],
                facts: {
                    ...result.facts,
                    location: result.facts.location === null ? null : { ...result.facts.location },
                    serialNumbers: [...result.facts.serialNumbers],
                    people: [...result.facts.people],
                },
                groups,
            },
        );
    },
});

export const photoExifStripTool = defineMcpTool({
    toolId: "photo-exif",
    verb: "strip",
    title: "Remove the metadata from a photo without re-encoding it",
    description:
        "Return the photo with its EXIF, GPS, XMP, IPTC, comments, text chunks, embedded thumbnails and any bytes after the image removed. The container is rewritten and the compressed image copied byte for byte, so nothing is decoded or re-encoded and no quality is lost. Keeps the ICC colour profile and a one-tag EXIF block holding the orientation unless told not to. Strips JPEG, PNG and WebP; HEIC, AVIF and TIFF are refused by name. The stripped file comes back Base64-encoded.",
    kind: "offline",
    inputSchema: z.object({
        photo: photoArgument,
        keepColorProfile: z
            .boolean()
            .default(DEFAULT_STRIP_OPTIONS.keepColorProfile)
            .describe("Keep the ICC colour profile, which describes colours rather than people"),
        keepOrientation: z
            .boolean()
            .default(DEFAULT_STRIP_OPTIONS.keepOrientation)
            .describe("Keep the orientation flag so a sideways-stored photo still opens upright"),
    }),
    run: ({ photo, ...options }) => {
        const decoded = decode(photo);

        if (!decoded.ok) {
            return decoded.outcome;
        }

        const result = stripPhoto(decoded.bytes, options);

        if (!result.ok) {
            return refuseWithReason("Photo EXIF", result.reason, { format: result.format ?? null });
        }

        const removedBytes = result.removed.reduce((sum, block) => sum + block.bytes, 0);

        return succeed(
            `${result.format.toUpperCase()}, ${decoded.bytes.length} → ${result.bytes.length} bytes; removed ${result.removed.map((block) => block.kind).join(", ") || "nothing"}`,
            {
                format: result.format,
                bytes: bytesToBase64(result.bytes),
                removed: result.removed.map((block) => ({ ...block })),
                removedBytes,
                keptOrientation: result.keptOrientation,
                keptColorProfile: result.keptColorProfile,
            },
        );
    },
});
