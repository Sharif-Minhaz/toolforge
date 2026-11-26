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

Decision tree 45 says depend: the figures are what the reader takes to an ISP.

## Nothing reported back

The library posts final results to `speed.cloudflare.com/__results` by
default. `logAimApiUrl: null` and `logMeasurementApiUrl: null` are its
documented off switches, and both are set. The traffic itself still reaches
Cloudflare, and the disclosure saying so sits above the Start button, not in
the article (rule 32). `runsOn` is `"server"` for the same reason, and the
catalogue test lists it among the tools that leave the browser.

The service worker passes cross-origin requests through untouched except for
model hosts, so test downloads are never cached — a cached 25 MB file would
"download" at memory speed.

## The engine is loaded on the press

`use-speed-test.ts` imports the library inside `start`, so the page carries
none of it until a test is wanted. Each run gets a fresh engine; callbacks
check `engineRef.current === engine` so a stopped run's late events cannot
overwrite a new one, and unmounting pauses it — a test left running would keep
pulling data.

## Verdicts are domain functions, and name what held them back

`verdictsByUseCase` (not `useCaseVerdicts` — the `use` prefix makes
`react-hooks/rules-of-hooks` treat it as a hook) returns, for each use case,
the measurement that decided it: a fast line with an F for bufferbloat is
"great" for 4K and "poor" for calls *because of lag under load*. Thresholds
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
