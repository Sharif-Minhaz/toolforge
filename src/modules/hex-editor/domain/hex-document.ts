import { MAX_FILE_BYTES } from "./constants";
import type { ByteEdit, OpenFileResult } from "../types";

/**
 * A file held open for editing.
 *
 * Two rules shape the whole class. The first is that reading a byte must stay a
 * single array index, because the grid asks for one on every cell of every row
 * it paints — anything with a search in it turns scrolling into a profile.
 *
 * The second is that an edit must never copy the buffer. A 512 MiB file
 * duplicated once per keystroke is not an editor, so overwritten bytes live in a
 * `Map` beside the original and `getByte` consults it. The original array is
 * never written to at all, which is also what makes "revert this byte" free and
 * what lets `dirty` mean *different from the file on disk* rather than *somebody
 * pressed a key*: typing a byte's existing value back over it drops the entry
 * and the document is clean again.
 *
 * The buffer is copied exactly once, in `save()`, because that is the one moment
 * a whole contiguous file is genuinely needed.
 */
export class HexDocument {
    readonly #bytes: Uint8Array;
    readonly #edits = new Map<number, number>();

    /** The name the file was opened under; `save()` suggests it back. */
    readonly name: string;

    constructor(bytes: Uint8Array, name: string) {
        this.#bytes = bytes;
        this.name = name;
    }

    get length(): number {
        return this.#bytes.length;
    }

    /** True while any byte differs from the bytes that were opened. */
    get dirty(): boolean {
        return this.#edits.size > 0;
    }

    get editCount(): number {
        return this.#edits.size;
    }

    /** Ascending, so a caller rendering change marks does not have to sort. */
    get editedOffsets(): readonly number[] {
        return [...this.#edits.keys()].toSorted((a, b) => a - b);
    }

    /**
     * `0` past the end rather than `undefined`.
     *
     * The grid's last row is short — a 20-byte file ends four bytes into row
     * one — and every caller would otherwise repeat the same bounds check. The
     * row builder knows the true length and renders the tail as blank.
     */
    getByte(offset: number): number {
        const edited = this.#edits.get(offset);

        if (edited !== undefined) {
            return edited;
        }

        return this.#bytes[offset] ?? 0;
    }

    isEdited(offset: number): boolean {
        return this.#edits.has(offset);
    }

    /**
     * Overwrites one byte and reports what changed, or `null` when nothing did.
     *
     * `null` is the answer for a keystroke that types a byte's existing value,
     * and it is what keeps that keystroke off the undo stack — an undo that
     * restores the value already on screen looks broken.
     *
     * A value outside a byte, or an offset outside the file, is programmer
     * error: every caller here clamps first, and a silent no-op would hide the
     * bug rather than the keystroke.
     */
    setByte(offset: number, value: number): ByteEdit | null {
        if (!Number.isInteger(offset) || offset < 0 || offset >= this.#bytes.length) {
            throw new RangeError(`Offset ${offset} is outside the document.`);
        }

        if (!Number.isInteger(value) || value < 0 || value > 0xff) {
            throw new RangeError(`${value} is not a byte.`);
        }

        const previous = this.getByte(offset);

        if (previous === value) {
            return null;
        }

        if (this.#bytes[offset] === value) {
            this.#edits.delete(offset);
        } else {
            this.#edits.set(offset, value);
        }

        return { offset, previous, next: value };
    }

    /** Applies an edit as recorded — the shape undo and redo both hand back. */
    applyEdit(edit: ByteEdit): void {
        this.setByte(edit.offset, edit.next);
    }

    /** `[start, end)`, clamped, with every overwritten byte already in place. */
    slice(start: number, end: number): Uint8Array {
        const from = Math.max(0, Math.min(start, this.#bytes.length));
        const to = Math.max(from, Math.min(end, this.#bytes.length));
        const out = this.#bytes.slice(from, to);

        // Walking the edits rather than the slice: a document has at most a few
        // hundred of them and a slice can be the whole file.
        for (const [offset, value] of this.#edits) {
            if (offset >= from && offset < to) {
                out[offset - from] = value;
            }
        }

        return out;
    }

    /** The finished file. The one place the buffer is copied whole. */
    save(): Uint8Array {
        return this.slice(0, this.#bytes.length);
    }
}

/**
 * The gate every opened file goes through, kept out of the class so the refusal
 * is a value the UI can localise rather than an exception it has to catch.
 */
export function acceptFileBytes(bytes: Uint8Array): OpenFileResult {
    if (bytes.length === 0) {
        return { ok: false, reason: "empty_file" };
    }

    if (bytes.length > MAX_FILE_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    return { ok: true, bytes };
}
