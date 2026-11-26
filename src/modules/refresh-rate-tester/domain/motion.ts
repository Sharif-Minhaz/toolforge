/**
 * Where the motion test's block sits, `distance` pixels into its run. It
 * enters from the left edge and leaves by the right, so each pass crosses the
 * whole track and then starts again.
 */
export function blockOffset(distance: number, trackWidth: number, blockWidth: number): number {
    const travel = trackWidth + blockWidth;

    return (((distance % travel) + travel) % travel) - blockWidth;
}

/** How far the block jumps between two refreshes: the thing a faster screen makes smaller. */
export function stepPerFrame(pxPerSecond: number, hz: number): number {
    return pxPerSecond / hz;
}
