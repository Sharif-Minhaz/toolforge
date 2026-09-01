/**
 * Whether this browser can take a video apart and put it back together.
 *
 * `VideoDecoder` and `VideoEncoder` are the whole requirement: everything else
 * the video half needs — a canvas, a `Blob`, typed arrays — has been everywhere
 * for years. Checked as a pair, because a browser that can only decode would let
 * the reader watch the frames go by and then have nowhere to write them.
 *
 * Never read during a render pass. The server has neither constructor, so a
 * component that branched on this directly would produce different markup on the
 * two sides of hydration; the panel reads it behind `useIsHydrated`.
 */
export function hasVideoCodecs(): boolean {
    return typeof VideoDecoder === "function" && typeof VideoEncoder === "function";
}
