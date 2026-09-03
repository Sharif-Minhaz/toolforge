"use client";

import { useRef, useState } from "react";

import { Slider } from "@/components/ui/slider";
import type { NormalizedBox, SourceVideoFacts } from "../types";
import { WatermarkBoxEditor } from "./watermark-box-editor";

type VideoBoxEditorProps = {
    /** Object URL of the picked clip. */
    url: string;
    facts: SourceVideoFacts;
    box: NormalizedBox;
    disabled: boolean;
    /** Accessible name for the box itself. */
    label: string;
    /** Accessible name for the frame slider. */
    scrubLabel: string;
    previewLabel: string;
    describedById: string;
    onBoxChange: (box: NormalizedBox) => void;
};

/**
 * The clip, under the shared search box, with a slider for moving through it.
 *
 * The video carries no native controls on purpose. A browser draws its control
 * bar across the bottom of the frame, which is exactly where a Gemini or Veo
 * watermark sits, so the controls and the thing they exist to help you see would
 * be fighting over the same forty pixels. A slider below the frame does the same
 * job with none of the overlap, and leaves the whole picture free for the box.
 */
export function VideoBoxEditor({
    url,
    facts,
    box,
    disabled,
    label,
    scrubLabel,
    previewLabel,
    describedById,
    onBoxChange,
}: VideoBoxEditorProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [time, setTime] = useState(0);

    return (
        <WatermarkBoxEditor
            size={{ width: facts.width, height: facts.height }}
            box={box}
            disabled={disabled}
            label={label}
            describedById={describedById}
            corner="bottom-right"
            onBoxChange={onBoxChange}
            footer={
                <Slider
                    aria-label={scrubLabel}
                    value={time}
                    min={0}
                    max={Math.max(facts.durationSeconds, 0.1)}
                    step={0.05}
                    disabled={disabled}
                    onValueChange={(next) => {
                        const seconds = Array.isArray(next) ? (next[0] ?? 0) : next;

                        setTime(seconds);

                        if (videoRef.current !== null) {
                            videoRef.current.currentTime = seconds;
                        }
                    }}
                    className="min-w-0"
                />
            }
        >
            <video
                ref={videoRef}
                src={url}
                muted
                playsInline
                preload="auto"
                aria-label={previewLabel}
                className="block h-auto w-full"
                onLoadedMetadata={() => setTime(0)}
            />
        </WatermarkBoxEditor>
    );
}
