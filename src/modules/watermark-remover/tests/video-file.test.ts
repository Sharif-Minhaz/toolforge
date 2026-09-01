import { describe, expect, test } from "bun:test";

import { buildCleanVideoFilename } from "@/modules/watermark-remover/domain/export";
import {
    ALLOWED_VIDEO_TYPES,
    MAX_VIDEO_BYTES,
    type AllowedVideoType,
} from "@/modules/watermark-remover/domain/video-constants";
import { checkVideoFile } from "@/modules/watermark-remover/domain/video-file";

const AT = new Date("2026-07-30T10:15:00.000Z");

describe("checkVideoFile", () => {
    test("accepts every container the pipeline can demux", () => {
        for (const type of ALLOWED_VIDEO_TYPES) {
            expect(checkVideoFile({ name: "clip", type, size: 1024 })).toEqual({ ok: true, type });
        }
    });

    test("tolerates the casing and parameters a form post adds", () => {
        expect(
            checkVideoFile({ name: "clip.mp4", type: "Video/MP4; codecs=avc1", size: 10 }),
        ).toEqual({ ok: true, type: "video/mp4" });
    });

    test("falls back to the extension when the browser reports no type at all", () => {
        const cases: readonly (readonly [string, AllowedVideoType])[] = [
            ["clip.mkv", "video/x-matroska"],
            ["clip.MOV", "video/quicktime"],
            ["clip.m4v", "video/mp4"],
            ["clip.webm", "video/webm"],
        ];

        for (const [name, type] of cases) {
            expect(checkVideoFile({ name, type: "", size: 10 })).toEqual({ ok: true, type });
        }
    });

    test("reports an empty file as empty rather than as an unknown type", () => {
        expect(checkVideoFile({ name: "clip.mp4", type: "", size: 0 })).toEqual({
            ok: false,
            reason: "empty_file",
        });
    });

    test("refuses what it cannot demux", () => {
        for (const name of ["clip.avi", "clip.gif", "clip", "clip.mp3"]) {
            expect(checkVideoFile({ name, type: "", size: 10 })).toEqual({
                ok: false,
                reason: "unsupported_type",
            });
        }
    });

    test("does not let a name override a type the browser did supply", () => {
        expect(checkVideoFile({ name: "clip.mp4", type: "image/png", size: 10 })).toEqual({
            ok: false,
            reason: "unsupported_type",
        });
    });

    test("refuses a file past the ceiling, and accepts one exactly on it", () => {
        expect(checkVideoFile({ name: "a.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES })).toEqual(
            {
                ok: true,
                type: "video/mp4",
            },
        );
        expect(
            checkVideoFile({ name: "a.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES + 1 }),
        ).toEqual({ ok: false, reason: "too_large" });
    });
});

describe("buildCleanVideoFilename", () => {
    test("keeps the reader's own name and says what happened", () => {
        expect(buildCleanVideoFilename("My Clip.mp4", AT)).toBe(
            "my-clip-watermark-removed-20260730T101500Z.mp4",
        );
    });

    test("falls back to a clip, not to a picture, when the name leaves nothing", () => {
        expect(buildCleanVideoFilename("!!!.mov", AT)).toBe(
            "clip-watermark-removed-20260730T101500Z.mp4",
        );
    });

    test("always ends in .mp4, whatever went in", () => {
        for (const name of ["a.mov", "b.webm", "c.MKV", ""]) {
            expect(buildCleanVideoFilename(name, AT).endsWith(".mp4")).toBe(true);
        }
    });
});
