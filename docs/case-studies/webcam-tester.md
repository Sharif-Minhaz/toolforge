# Webcam Tester

`src/modules/webcam-tester/` — opening a camera, naming why it would not open,
and reporting what it really sends.

The permission, device-list and failure code knows nothing about cameras: it
takes a `MediaKind` and reads the `mediaDevices` message namespace, and lives in
the shared layer — `src/modules/tools/domain/media-failure.ts`,
`domain/media-devices.ts`, `components/use-media-stream.ts`,
`components/media-device-picker.tsx` and `components/media-failure-notice.tsx`,
tested in `tools/tests/` — because the microphone tester
([`mic-tester.md`](mic-tester.md)) opens its device through the same code. The
sections below hold for both.

---

## An insecure page looks like a browser without capture

Chrome removes `navigator.mediaDevices` from a plain-http page, so checking for
`getUserMedia` first reports `unsupported` and blames the browser for the
address. `checkMediaEnvironment` checks `isSecureContext` first. Both are read
after hydration only, and the Start button is disabled with the reason in the
preview rather than offered and refused.

## Device names do not exist before permission

`enumerateDevices()` lists at most one placeholder per kind, with an empty id
and an empty label, until the page is allowed in. That placeholder cannot be
requested, so `listInputDevices` drops it: an empty list means "not allowed
yet", never "nothing connected". The list is read again the moment a stream
starts, and on `devicechange`.

## A chosen device is `exact`; a size is `ideal`

A picked camera that is busy or gone must fail with its own name, not quietly
open a different one — so `deviceId` is `exact`. A size the camera lacks must
still open — so width and height are `ideal`, and the report says what was
delivered instead. Unasked, Chrome opens every camera at 640 × 480, which is why
the default preset asks for 8K: the nearest mode is the camera's largest. A pick
that has since been unplugged falls back to the default on the next Start, or
every retry would be `overconstrained` again.

## Every path stops the tracks

A new request, Stop, and unmount all stop the previous stream's tracks before
anything else, and each request takes a number so an answer that arrives after a
newer request (a fast second pick) is stopped on arrival. A track left running
keeps the camera light on and locks the device against every other app —
which is exactly the `in_use` failure this tool explains.

`stop()` never fires `ended`; only the source going away does (unplugged,
switched off, taken by the system). That is its own failure, `ended`, so a
frozen last frame is never shown as live.

## Navigating away keeps the state but runs the cleanup

Next hides a page with React's `<Activity>` rather than unmounting it, so
`useState` survives while effect cleanups run. The cleanup releases the camera
**and** sets the state back to idle; releasing alone would bring the reader back
to a "live" badge over a dead stream.

## Capabilities describe the browser as much as the camera

Firefox has no `getCapabilities`, which is reported as a fact, not a failure.
Under Chrome's crop-and-scale the width and height ranges start at 1 (the
scaler can make anything smaller) and `aspectRatio` spans 1 / height to
width / 1, so it is left out: only the maxima describe the camera.
