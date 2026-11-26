# Microphone Tester

`src/modules/mic-tester/` — a level meter, a spectrum and a short recording over
one microphone stream.

Opening the device, listing the others and naming every refusal is the shared
code the webcam tester left behind for it — `tools/components/use-media-stream.ts`
and its neighbours, read [`webcam-tester.md`](webcam-tester.md) first. What is
below is what the microphone added on top.

---

## The analyser is never connected to the speakers

`createMediaStreamSource → createAnalyser` and stop. Connecting either to
`audio.destination` plays the microphone straight back out, which loops into the
microphone and howls on any laptop without headphones. Hearing yourself is what
the recorded clip is for.

## One audio context per stream, closed with it

`LevelMeter` builds the graph in an effect keyed on the stream and tears it down
in the cleanup — frame loop cancelled, source disconnected, context closed. A
context left open keeps the audio thread running after Stop. The context is
created after `getUserMedia` resolves rather than inside the press, so it is
`resume()`d explicitly; a context outside a user gesture can start suspended.

The published reading carries the stream it came from, so a stopped or replaced
stream shows "—" instead of its last level without any state being reset.

## Draw every frame; publish ten times a second

The spectrum is painted straight onto the canvas each frame with no React state.
The numbers are not: a dBFS figure changing sixty times a second cannot be read,
and re-rendering the island that often costs for nothing. Samples are folded into
a window between readings (`addSamples`), so a transient between two readings
still reaches the peak, and only `LevelMeter` re-renders.

The peak marker holds for 1.5 s, then falls at 20 dB/s. `PeakHold` stores the
value and the moment it arrived, never a decayed copy: storing the decayed value
and decaying it again on the next reading compounds the fall.

## dBFS against something that is not this meter

RMS is relative to a full-scale square, so a full-scale sine reads −3.01 dBFS —
the convention most software meters use, and FFmpeg's. Six signals (four sines,
two tones plus DC, seeded noise), written as raw `f32le`, read identically to the
sixth decimal through FFmpeg's `astats`; the figures are pinned in
`tests/level.test.ts`. Silence is `-Infinity`, which `Intl` formats as `-∞` in
both locales, so nothing special-cases it.

Clipping is judged on the held peak, not the instant one, so one clipped sample
is still named a second later. The word beside the meter — silent, quiet, good,
clipping — is the text equivalent of the bar's colour.

## Processing is fixed when the track opens

Echo cancellation, noise suppression and automatic gain are constraints, so a
switch reopens the microphone rather than being applied to the running track.
They are bare booleans, not `exact`: a browser that cannot turn one off still
opens, and the report puts what `getSettings()` says beside what was asked
(`Off (asked for on)`). Newer Chrome may report `echoCancellation` as a mode
string (`"all"`, `"remote-only"`) rather than `true`; any string reads as on.

## The clip keeps what was caught, and dies with the page

A new device, a processing switch or Stop ends the stream, and with it the
recording — which then becomes the clip rather than being thrown away, so
"record, flip noise suppression, record again" works. Navigating away (Next's
`<Activity>` runs effect cleanups without unmounting) discards it and revokes the
object URL; the `stop` event that arrives afterwards is ignored rather than
minting a URL nobody will revoke.

No MIME type is requested: each browser records the container it can play back
itself (WebM in Chrome, Ogg in Firefox, MP4 in Safari). Chrome's WebM carries no
duration, so its player shows none until the clip has played once; the length is
measured and shown beside it instead.

## The spectrum axis is fixed

50 Hz to 16 kHz, log-spaced, so its labels can be drawn on the server. Every
audio context runs at 32 kHz or more, and a band above Nyquist is simply empty.
At an FFT of 2048 (23 Hz bins at 48 kHz) the bottom bands are narrower than one
bin and repeat it, which is the staircase at the left edge.
