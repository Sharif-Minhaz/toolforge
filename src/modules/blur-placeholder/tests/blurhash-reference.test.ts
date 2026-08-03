import { decode as referenceDecode, encode as referenceEncode } from "blurhash";
import { describe, expect, test } from "bun:test";

import { decodeBlurhash, encodeBlurhash } from "@/modules/blur-placeholder/domain/blurhash";
import { checkerImage, gradientImage, noiseImage, solidImage } from "./images";

/**
 * The codec, checked against something that is not this repository.
 *
 * A hash that only this file's assertions agree with is worth nothing: the
 * strings written here are read by react-blurhash in someone else's browser and
 * by the Kotlin and Swift ports on someone else's phone. A wrong constant in the
 * quantiser, or an off-by-one in the coefficient order, still produces output
 * that looks exactly like a BlurHash — self-consistent, plausible, and
 * unreadable by any of them.
 *
 * So every case below runs through `blurhash`, the reference implementation, and
 * demands the same string and the same bytes. It is a devDependency and ships
 * nowhere; what ships is the implementation in `domain/`, which is a tenth the
 * size of pulling the package in at runtime and can be read alongside the
 * article that explains it.
 *
 * The whole component domain is covered, not a sample. The quantiser's scale is
 * chosen from the largest coefficient present, so a picture with almost no
 * detail and a picture with nothing but detail exercise different arithmetic —
 * and the 1 × 1 case has no AC coefficients at all, which is its own branch.
 */

const IMAGES = [
    { name: "gradient", image: gradientImage(64, 43) },
    { name: "noise", image: noiseImage(64, 43, 20_260_803) },
    { name: "checker", image: checkerImage(64, 43, 7) },
    { name: "solid", image: solidImage(64, 43, [12, 180, 96]) },
    { name: "black", image: solidImage(9, 9, [0, 0, 0]) },
    { name: "white", image: solidImage(9, 9, [255, 255, 255]) },
] as const;

describe("encodeBlurhash matches the reference implementation", () => {
    for (const { name, image } of IMAGES) {
        for (let componentX = 1; componentX <= 9; componentX += 1) {
            for (let componentY = 1; componentY <= 9; componentY += 1) {
                test(`${name} at ${componentX}×${componentY}`, () => {
                    const result = encodeBlurhash(image, componentX, componentY);
                    const expected = referenceEncode(
                        image.data,
                        image.width,
                        image.height,
                        componentX,
                        componentY,
                    );

                    expect(result).toEqual({ ok: true, hash: expected });
                });
            }
        }
    }
});

/**
 * Decoding is checked at the default punch only, and deliberately so.
 *
 * `blurhash@2` opens its decoder with `punch = punch | 1`, which reads like a
 * default and is not one: it truncates to an integer and sets the low bit, so
 * 2 and 2.5 both become 3 and 0.5 becomes 1. Comparing against it at any other
 * value would be asserting that this tool reproduces a defect. Punch is checked
 * on its own terms below, and at 1 — where the expression is a no-op — the
 * comparison still covers the basis loop, the coefficient unpacking and the
 * colour conversion for every pixel.
 */
describe("decodeBlurhash matches the reference implementation", () => {
    const shapes = [
        { width: 32, height: 21 },
        { width: 4, height: 4 },
        { width: 64, height: 64 },
        { width: 1, height: 1 },
    ] as const;

    for (const { name, image } of IMAGES) {
        for (const [componentX, componentY] of [
            [1, 1],
            [5, 4],
            [9, 9],
        ]) {
            test(`${name} at ${componentX}×${componentY}`, () => {
                const encoded = encodeBlurhash(image, componentX, componentY);

                expect(encoded.ok).toBe(true);

                if (!encoded.ok) {
                    return;
                }

                for (const shape of shapes) {
                    const decoded = decodeBlurhash(encoded.hash, shape.width, shape.height);
                    const expected = referenceDecode(encoded.hash, shape.width, shape.height);

                    expect(decoded.ok).toBe(true);

                    if (decoded.ok) {
                        expect([...decoded.pixels]).toEqual([...expected]);
                    }
                }
            });
        }
    }

    test("agrees on a hash this tool did not write", () => {
        // From the BlurHash project's own README, so the check does not depend
        // on our encoder being right about the string in the first place.
        const hash = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";
        const decoded = decodeBlurhash(hash, 32, 32);

        expect(decoded.ok).toBe(true);

        if (decoded.ok) {
            expect([...decoded.pixels]).toEqual([...referenceDecode(hash, 32, 32)]);
        }
    });
});
