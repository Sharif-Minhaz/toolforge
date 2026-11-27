# Link Preview & OG Checker

`src/modules/link-preview/` — fetching a stranger's page the way a crawler does,
and reproducing eight platforms' card rules without pretending to know more of
them than the platforms publish.

The SSRF doctrine it follows is in
[`../patterns/outbound-requests.md`](../patterns/outbound-requests.md#part-one-a-host-the-reader-named);
the fail-closed quota is in [`../security.md`](../security.md). This file is what
is specific to the module.

---

## Two fetchers, deliberately not one

The page fetch (`repository/fetch-page.ts`) and the shared picture fetch
(`tools/repository/remote-image.ts`) obey the same rules — resolve, guard,
connect to the checked address, re-guard every hop, cap while streaming — and
still live apart. They differ in what they accept (`text/html` against
`image/*`), how they stop (at `</head>` against at the byte ceiling) and what
they return, and a shared version would need all three injected. Decision 40's
fourth branch: the duplication is cheaper than the abstraction.

The picture side reused the shared fetcher instead, with two new optional
arguments — a lower `maxBytes` (8 MB, Facebook's ceiling and the most generous
any platform publishes) and a user agent naming this tool, so a site owner
reading a log can tell the importer and the debugger apart.

## Two refusals the first draft folded into one

Both were caught by exercising the fetcher on Node against real hosts, not by
the unit tests:

- **A DNS failure was reported as `blocked_address`.** `resolveGuarded`
  returned `null` for "resolves only to private space" and for "does not
  resolve", so a DNS timeout told the reader their public site was on a deny
  list. They are `blocked_address` and `unresolved_host` now (rule 28).
- **IPv6 literals were refused by accident.** `URL.hostname` keeps the brackets
  — `[::ffff:7f00:1]` — and `lookup` rejects them, so the refusal came from a
  thrown resolver rather than from the guard. A *public* IPv6 literal would
  have been refused too. Literals now skip `lookup` and go straight to
  `guardAddresses`, and SNI is omitted for them (RFC 6066 forbids an address
  there).

The shared image fetcher still has both behaviours. It is a separate change.

## Every platform rule carries its provenance

`domain/platforms.ts` is a table, and every number in it is `official` (the
platform's own documentation) or `reported` (a community measurement), with the
URL it came from. The cards and the findings both surface the difference: "WhatsApp
refuses this" and "people report X does this" are different things to act on.

Read in November 2026. What was contested, and which side the table takes:

| Claim | Taken as | Why |
| --- | --- | --- |
| WhatsApp image limit 300 KB | **600 KB**, official | WhatsApp's link-preview page says 600 KB for the picture; 300 KB is its limit on how far into the HTML the head may end, misremembered |
| X large card shows title and description | **Title over the image, no description**, reported | Headlines were cut in October 2023, briefly restored in January 2024, then cut again; nothing official describes the current card |
| Facebook accepts WebP | **Undocumented, warning only** | Facebook's docs list JPEG, GIF and PNG for `og:image:type`, yet it renders WebP in practice. A first draft dropped the picture from the Facebook card; the Prothom Alo home page, serving a WebP `og:image`, would have been reported as broken on Facebook when it is not |
| Discord limits in characters | **UTF-8 bytes**, official | Discord's docs say 70 and 350 bytes. A Bangla headline spends three bytes a letter, so it is cut at about twenty letters where every other card shows it whole |
| Slack reads the first 32 KB | Reported, shown as a note | Widely repeated, not documented |
| Google cuts titles at 60 characters | Reported, pixel-based in reality | About 580 px for titles, 920 px for descriptions; the counts are what those widths usually hold |

When a platform changes its cards, change the table and this one together.

## The picture is measured from its header, not decoded

There is no canvas on the server, and decoding an 8 MB JPEG to learn two
numbers in its first kilobyte would pay for the whole picture to read its
label. `domain/image-size.ts` reads PNG `IHDR`, GIF, BMP, the three WebP chunk
types, the JPEG start-of-frame marker after a segment walk, and the largest
AVIF `ispe` box.

It was cross-checked against `sharp` — libvips, already installed with Next —
over 62 encodes: eight sizes from 1 × 1 to 16383 × 3 across PNG, baseline and
progressive JPEG, lossy, lossy-with-alpha and lossless WebP, GIF and AVIF. All
62 agreed. `sharp` cannot write BMP, so those two cases are hand-built in the
unit tests. EXIF orientation is not applied: the stored size is reported, which
is also what `sharp`'s metadata reports.

## What the reader's browser never does

It never fetches the inspected site. The picture comes back from the Server
Action as a data URL and is drawn from that, so the reader's address does not
reach the site and hotlink protection cannot break the card. The MCP adapter
strips the data URL and keeps the measurement: a model has no use for eight
megabytes of base64.

## One analysis, two modes

`analyzePreview` is pure and is the only thing that decides cards and
findings. The fetch mode runs it on what the server returned; the Paste HTML
mode runs it in the tab on a debounced read of the box; the MCP `parse` tool
runs it on the caller's markup. A rule changed in one place is changed in all
three.

The paste mode needs no salt and no database, so a deployment that cannot meter
the fetch still has half the tool. Its one server call — **Measure** — spends
the same quota, keyed on the picture's host.

## No impersonation

The fetch sends `ToolForge-LinkPreview/1.0`, not `facebookexternalhit` or
`Twitterbot`. A site that serves preview tags only to known crawlers will look
tagless here, and the FAQ says so. Claiming to be someone else's crawler would
make the tool more accurate for those sites and dishonest toward all of them.
