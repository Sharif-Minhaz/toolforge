"use client";

import { IconPhotoPlus, type IconProps } from "@tabler/icons-react";
import { useState, type ComponentType, type DragEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The way a picture gets into a tool on this site.
 *
 * Four tools had written this out separately — the same dashed panel, the same
 * `peer sr-only` input behind it, the same drag state — and the fourth one
 * drifted, which is what a reader notices first: an intake that does not look
 * like the intake on the tool they used yesterday. Lifted here whole rather than
 * copied a fifth time.
 *
 * Two details are the reason it is a `<label>` wrapped around a hidden `<input>`
 * rather than a `<div>` with a click handler:
 *
 * - The input keeps real keyboard and screen-reader behaviour. A div that opens
 *   a file picker on click has neither, and no amount of `role` puts it back.
 * - `peer-focus-visible` is what draws the focus ring on the panel when the
 *   input behind it is tabbed to, which needs the input to be an immediate
 *   sibling *before* the label. Reordering them silently loses the ring.
 *
 * `ImageSourceControls` — paste and fetch-by-address — is deliberately not part
 * of this. It renders whether or not a picture is already chosen, and folding it
 * in would take Ctrl+V away the moment the panel is replaced by a result.
 */

type ImageDropzoneProps = {
    /** Shared with the caller's `aria-describedby` target, so the two stay in step. */
    readonly inputId: string;
    readonly title: ReactNode;
    readonly hint: ReactNode;
    /** `accept` for the picker — a hint to it, never a substitute for the check. */
    readonly accept: string;
    readonly disabled?: boolean;
    readonly multiple?: boolean;
    readonly describedById?: string;
    /** Defaults to the picture-plus glyph the other image tools use. */
    readonly icon?: ComponentType<IconProps>;
    readonly onFiles: (files: readonly File[]) => void;
    readonly className?: string;
};

export function ImageDropzone({
    inputId,
    title,
    hint,
    accept,
    disabled = false,
    multiple = false,
    describedById,
    icon: Icon = IconPhotoPlus,
    onFiles,
    className,
}: ImageDropzoneProps) {
    const [dragging, setDragging] = useState(false);

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);

        if (!disabled) {
            onFiles([...event.dataTransfer.files]);
        }
    }

    return (
        <>
            <input
                id={inputId}
                type="file"
                accept={accept}
                multiple={multiple}
                disabled={disabled}
                aria-describedby={describedById}
                onChange={(event) => {
                    onFiles([...(event.target.files ?? [])]);
                    // Cleared so picking the same file twice still fires.
                    event.target.value = "";
                }}
                className="peer sr-only"
            />

            <label
                htmlFor={inputId}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                    "border-border/80 bg-card/40 hover:border-primary/50 peer-focus-visible:ring-ring flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors duration-200 peer-focus-visible:ring-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                    dragging &&
                        "border-primary/70 bg-[color-mix(in_oklch,var(--primary)_6%,transparent)]",
                    className,
                )}
            >
                <Icon className="text-muted-foreground size-7" stroke={1.6} aria-hidden="true" />
                <span className="text-[0.9375rem] leading-[1.4] font-medium">{title}</span>
                <span className="text-muted-foreground text-[0.8125rem] leading-normal">
                    {hint}
                </span>
            </label>
        </>
    );
}
