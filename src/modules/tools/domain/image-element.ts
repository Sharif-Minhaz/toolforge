export type ImagePixelSize = {
    readonly width: number;
    readonly height: number;
};

/**
 * The slice of `HTMLImageElement` the load dance touches. Loose enough that
 * `new Image()` satisfies it and a test can hand over a plain object instead of
 * needing a DOM.
 */
export type LoadableImage = {
    src: string;
    onload: ((...args: never[]) => unknown) | null;
    onerror: ((...args: never[]) => unknown) | null;
};

/**
 * Decodes an image and resolves the element itself, so a caller that needs to
 * draw it does not have to load it twice.
 *
 * Resolves `null` rather than rejecting: a file the browser cannot decode is
 * usually still worth sending upstream, and every caller here would otherwise
 * wrap this in the same `try`.
 */
export function loadImage<T extends LoadableImage>(
    src: string,
    create: () => T,
): Promise<T | null> {
    return new Promise((resolve) => {
        const image = create();

        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        // Assigned last: a cached image can fire `load` on assignment.
        image.src = src;
    });
}

export function loadImageElement(src: string): Promise<HTMLImageElement | null> {
    return loadImage(src, () => new Image());
}

/** Just the dimensions, for a caller with no use for the element itself. */
export async function readImagePixelSize(src: string): Promise<ImagePixelSize | null> {
    const image = await loadImageElement(src);

    return image === null ? null : { width: image.naturalWidth, height: image.naturalHeight };
}
