"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { listInputDevices, type MediaDevice, type MediaKind } from "../domain/media-devices";
import {
    checkMediaEnvironment,
    classifyMediaError,
    type MediaEnvironment,
    type MediaFailure,
} from "../domain/media-failure";

export type MediaStreamState =
    | { readonly status: "idle" }
    | { readonly status: "starting" }
    | {
          readonly status: "live";
          readonly stream: MediaStream;
          readonly track: MediaStreamTrack;
      }
    | { readonly status: "failed"; readonly failure: MediaFailure };

/** Typed as always there, but Chrome removes it from an insecure page. */
function mediaDevicesOrNull(): MediaDevices | null {
    return (navigator.mediaDevices as MediaDevices | undefined) ?? null;
}

function readMediaEnvironment(): MediaEnvironment {
    return {
        isSecureContext: window.isSecureContext,
        hasGetUserMedia: typeof mediaDevicesOrNull()?.getUserMedia === "function",
    };
}

function stopTracks(stream: MediaStream | null) {
    for (const track of stream?.getTracks() ?? []) {
        track.stop();
    }
}

/**
 * One capture device of one kind: asking for it, naming why it did not start,
 * listing the alternatives, and letting go of it.
 *
 * Every path that ends a stream stops its tracks — a new request, Stop, the
 * page going away — because a track left running keeps the camera light on and
 * the device locked against every other app. The browser is read during render
 * only once hydrated, and otherwise only from events and effects, so the server
 * pass and the hydration pass agree.
 */
export function useMediaStream(kind: MediaKind) {
    const [state, setState] = useState<MediaStreamState>({ status: "idle" });
    // Known before anything is asked, so an http page or a browser without
    // capture can say so instead of offering a button that cannot work.
    const blocked = useIsHydrated() ? checkMediaEnvironment(readMediaEnvironment()) : null;
    const [devices, setDevices] = useState<readonly MediaDevice[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    // Each request takes a number; an answer for a superseded one is stopped
    // on arrival, so a fast second pick never leaves the first stream running.
    const requestRef = useRef(0);

    const release = useCallback(() => {
        requestRef.current += 1;
        stopTracks(streamRef.current);
        streamRef.current = null;
    }, []);

    const refreshDevices = useCallback(async () => {
        try {
            const infos = (await mediaDevicesOrNull()?.enumerateDevices()) ?? [];

            setDevices(listInputDevices(infos, kind));
        } catch (caught) {
            logEvent("warn", "media.enumerate_failed", { kind, error: describeError(caught) });
        }
    }, [kind]);

    const start = useCallback(
        async (constraints: MediaTrackConstraints) => {
            release();
            const request = requestRef.current;
            const mediaDevices = mediaDevicesOrNull();
            const refused = checkMediaEnvironment(readMediaEnvironment());

            if (refused !== null || mediaDevices === null) {
                setState({ status: "failed", failure: refused ?? "unsupported" });

                return;
            }

            setState({ status: "starting" });

            try {
                const stream = await mediaDevices.getUserMedia(
                    kind === "video" ? { video: constraints } : { audio: constraints },
                );

                if (request !== requestRef.current) {
                    stopTracks(stream);

                    return;
                }

                const [track] =
                    kind === "video" ? stream.getVideoTracks() : stream.getAudioTracks();

                streamRef.current = stream;
                // `stop()` never fires `ended`; only the source going away does —
                // unplugged, switched off, or taken by the system.
                track.addEventListener("ended", () => {
                    if (streamRef.current === stream) {
                        release();
                        setState({ status: "failed", failure: "ended" });
                    }
                });
                setState({ status: "live", stream, track });
                // Labels only exist once access is allowed, so list again now.
                void refreshDevices();
            } catch (caught) {
                if (request !== requestRef.current) {
                    return;
                }

                logEvent("warn", "media.start_failed", { kind, error: describeError(caught) });
                setState({ status: "failed", failure: classifyMediaError(caught) });
            }
        },
        [kind, release, refreshDevices],
    );

    const stop = useCallback(() => {
        release();
        setState({ status: "idle" });
    }, [release]);

    useEffect(() => {
        const mediaDevices = mediaDevicesOrNull();

        if (mediaDevices === null) {
            return;
        }

        // Plugging a device in or out while the page is open.
        const onChange = () => void refreshDevices();

        mediaDevices.addEventListener("devicechange", onChange);

        return () => mediaDevices.removeEventListener("devicechange", onChange);
    }, [refreshDevices]);

    // Next keeps a page's state when the reader navigates away (React's
    // `<Activity>`) but runs this cleanup, so the device is released and the
    // state says so — coming back must not show a frozen "live" stream.
    useEffect(
        () => () => {
            release();
            setState({ status: "idle" });
        },
        [release],
    );

    return { state, devices, blocked, start, stop };
}
