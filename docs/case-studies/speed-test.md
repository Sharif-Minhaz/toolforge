# Internet Speed Test

`src/modules/speed-test/` — download, upload and latency, and what they mean:
lag under load, a verdict per use case, the plan against reality, and the hours
the line slows down.

Read it before touching `components/use-speed-test.ts` or `domain/analysis.ts`.

---

## Measured against Cloudflare, not against us

A speed test measures the path to its server. Ours is wherever the deployment
runs — for a reader in Dhaka, another continent — so a test against it reports
the distance, not the line, and costs us egress on every run. The engine is
`@cloudflare/speedtest` (MIT, no dependencies, maintained by Cloudflare), the
one behind speed.cloudflare.com, which answers from the nearest edge (Dhaka has
one). It times requests with the browser's Resource Timing API, takes the 90th
percentile of several file sizes per direction, and measures latency while the
line is idle and while it is loaded.

Decision tree 44 says depend: the figures are what the reader takes to an ISP.

## Nothing reported back

The library posts final results to `speed.cloudflare.com/__results` by
default. `logAimApiUrl: null` and `logMeasurementApiUrl: null` are its
documented off switches, and both are set. The traffic itself still reaches
Cloudflare. What crosses the wire is random test data, never anything the
reader typed or chose. The FAQ says who sees the traffic (a1) and what a run
costs on a capped plan (a4). `runsOn` is `"server"` because the traffic still leaves
the browser, and the catalogue test lists it among the tools that do.

The service worker passes cross-origin requests through untouched except for
model hosts, so test downloads are never cached — a cached 25 MB file would
"download" at memory speed.

## The engine is loaded on the press

`use-speed-test.ts` imports the library inside `start`, so the page carries
none of it until a test is wanted. Each run gets a fresh engine; callbacks
check `engineRef.current === engine` so a stopped run's late events cannot
overwrite a new one, and unmounting pauses it — a test left running would keep
pulling data.

## The engine interleaves; the readout does not

Cloudflare's default sequence is not latency → download → upload. It runs two
pings between every set — download 100 kB, ping, download 1 MB, ping, upload
100 kB, ping, … up to a 250 MB download — and `onResultsChange` reports each
one by its own type. Mapping that type straight onto the phase made the status
strip, the big figure and the link animation flick back to "latency" a dozen
times a run. `use-speed-test.ts` keeps the phase sticky: only a `download` or
`upload` event changes it, so the pings in between read as part of the set
around them. The same interleaving is why there is no phase stepper and no
percentage — the tiles mark which direction is measuring now, with an
indeterminate bar, because the engine ends each set early once requests take
long enough and has no honest progress to give.

## The link animation is decoration over a pure model

The stage (`link-stage.tsx`) draws the reader and Cloudflare's edge as two
nodes with five lanes between them: a ping bouncing for the round trip,
packets streaming in for a download and out for an upload. How many, how fast
and how long they are comes from `domain/signal.ts` — `throughputLevel` puts
the live rate on a log scale to 1 Gbps, `streamPace` turns that into spawn
rate, travel and streak — so "a faster line never looks slower" is a test, not
an impression. The canvas paints in its own CSS `color`, a theme token, and is
`aria-hidden`; the tiles and the status strip carry the figures.

The frame loop runs only while something moves, and not at all under
`prefers-reduced-motion`, which gets one still frame per state. A still frame
reads its colour once, so the canvas has no colour transition and a resize or
theme flip repaints it. The big figure (`live-figure.tsx`) counts toward each
measurement with a frame-rate-independent `approach`; it is keyed by unit so
moving from ms to Mbps counts up from zero instead of sliding between units.
The per-request trace under the button plots every request of the run in
order on one shared scale — the 100 kB → 250 MB ramp is visible as the line
spinning up — and is kept only for the run just finished; history stores the
summary, not the samples.

## Verdicts are domain functions, and name what held them back

`verdictsByUseCase` (not `useCaseVerdicts` — the `use` prefix makes
`react-hooks/rules-of-hooks` treat it as a hook) returns, for each use case,
the measurement that decided it: a fast line with an F for bufferbloat is
"great" for 4K and "poor" for calls _because of lag under load_. Thresholds
are the services' own published figures, in `constants.ts`.

The bufferbloat grade is on the **increase** under load, not the loaded
latency: a satellite link at 600 ms idle and 603 ms loaded is A+.

## History stays local, and the hour chart refuses to over-claim

Runs and the plan live in `localStorage` under the browser-persistence pattern
(`docs/patterns/browser-persistence.md`): storage injected, reads total,
`useSyncExternalStore` with an empty server snapshot so hydration never sees
history. The hour of day is read with `new Date(at).getHours()` only there —
after hydration, in the reader's zone — and injected into `hourlyMedians`, so
tests pin it to UTC.

`peakSlowdown` needs two hours with at least two runs each before it says
anything. One bad evening is noise, and a claim built on it sends a reader to
argue with their ISP over nothing.
