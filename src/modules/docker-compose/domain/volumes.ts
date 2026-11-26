/** A Docker volume name. Anything else in a short-syntax source is a host path. */
const VOLUME_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/** `C:\data:/data` — the drive letter's colon is not the separator. */
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;

/** Where the source ends in `source:target[:mode]`, or -1 for an anonymous volume. */
function sourceEnd(volume: string): number {
    const from = WINDOWS_DRIVE.test(volume) ? 2 : 0;

    return volume.indexOf(":", from);
}

/** `pgdata:/var/lib/postgresql/data` → `pgdata`; a bind mount or an anonymous volume → null. */
export function namedVolumeSource(volume: string): string | null {
    const end = sourceEnd(volume);

    if (end === -1) {
        return null;
    }

    const source = volume.slice(0, end);

    return VOLUME_NAME.test(source) ? source : null;
}

/** The same short-syntax volume with its named source swapped. */
export function renameVolumeSource(volume: string, name: string): string {
    return `${name}${volume.slice(sourceEnd(volume))}`;
}
