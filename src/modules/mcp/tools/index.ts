import type { McpTool } from "../types";
import { aesCryptTool } from "./aes";
import { base64ConvertTool } from "./base64";
import { bijoyUnicodeConvertTool } from "./bijoy-unicode";
import { bsonConvertTool } from "./bson";
import { catalogListTool } from "./catalog";
import { chmodConvertTool } from "./chmod";
import { colorConvertTool } from "./color";
import { cronExplainTool } from "./cron";
import { curlConvertTool } from "./curl";
import { diffCompareTool } from "./diff";
import { dockerComposeConvertTool } from "./docker-compose";
import { domainInspectTool } from "./domain-inspector";
import { equationConvertTool } from "./equation";
import { hashCompareTool, hashDetectTool, hashGenerateTool } from "./hash";
import { hexEditorDumpTool, hexEditorFindTool, hexEditorInspectTool } from "./hex-editor";
import { htmlMarkdownConvertTool } from "./html-markdown";
import { ipGlobeMapTool } from "./ip-globe";
import { jsonFormatTool } from "./json";
import { jwtDecodeTool, jwtSignTool, jwtVerifyTool } from "./jwt";
import { landMeasurementConvertTool } from "./land-measurement";
import { loremGenerateTool } from "./lorem";
import { markdownAnalyzeTool } from "./markdown";
import { numberToWordsConvertTool } from "./number-to-words";
import { passwordGenerateTool } from "./password";
import { pdfConverterConvertTool } from "./pdf-converter";
import { photoExifReadTool, photoExifStripTool } from "./photo-exif";
import { qrGenerateTool } from "./qr";
import { regexTestTool } from "./regex";
import { rsaCryptTool, rsaGenerateTool } from "./rsa";
import { secretGenerateTool } from "./secret";
import { slugCreateTool } from "./slug";
import { sortLinesTool } from "./sort";
import { sqlFormatterFormatTool } from "./sql-formatter";
import { subdomainLookupTool } from "./subdomain-lookup";
import { textCaseConvertTool } from "./text-case";
import { timestampConvertTool } from "./timestamp";
import { urlConvertTool, urlParseTool } from "./url";
import { uuidGenerateTool } from "./uuid";

/**
 * Everything this endpoint exposes, in the order a client will list it.
 *
 * One array, and adding to it is the whole of registering a tool — there is no
 * second place to remember. The order is alphabetical by tool name, which is
 * also how most clients render the list, so what a reader sees here is what
 * they will see there.
 *
 * **What is deliberately absent, and why.** Three groups, each for a reason
 * that is a fact about the tool rather than a gap in this file:
 *
 * - **The image tools** — compressor, converter, resizer, blur placeholder, the
 *   Image to 3D Model, and the Background Remover. They decode pixels
 *   in a canvas and re-encode them through WebAssembly codecs built for the
 *   browser. The Favicon Generator is absent for the same reason from the other
 *   end: it draws text on a canvas with the reader's fonts, and its emoji with
 *   the reader's system emoji font. There is no canvas in a
 *   request handler, and a server-side reimplementation would be a second
 *   encoder to keep in step with the one on the page. The Background Remover
 *   adds a second reason on top of the first: its segmentation weights are
 *   fetched into the *reader's* browser and cached there, so running it here
 *   would move a hundred-megabyte download and the inference that follows onto
 *   this deployment for every call — the tool is local precisely so that cost
 *   is not ours to pay. Image to Text is absent for that second reason alone:
 *   Tesseract and its language data are fetched into the reader's browser and
 *   run in a web worker there, so an adapter would put seconds of recognition
 *   per picture onto this deployment for every call — and a model that wants
 *   the text in a picture can already read it. `toolforge_catalog_list` returns
 *   their addresses so a caller can send somebody to the page instead.
 * - **The studios** — Mock Server, JSON Server, GraphQL Server, and the URL
 *   Shortener. Every one of them mints a public address and stores what is
 *   posted to it, against an ownership model built on browser cookies. An MCP
 *   caller has no cookie jar and no way to prove it owns what it created, so
 *   exposing creation here would mint unreclaimable resources.
 * - **The AI tools** — the Watermark Remover's *image* half and the Equation
 *   converter's *image* half. They spend a third-party
 *   API budget per call. That is a decision about money rather than about
 *   capability, and it belongs to whoever is paying rather than to this file.
 *   Note the seam: the
 *   Equation tool's text half is `toolforge_equation_convert` below and runs
 *   here like any other offline tool, because turning `x2 + y2 = r2` into LaTeX
 *   costs nothing. Only reading a picture is withheld — a model that wants an
 *   equation transcribed already has eyes of its own.
 *
 *   Text to Speech belongs here too, for the nearest thing it has to a budget:
 *   the patience of Microsoft's Read Aloud service, which sees every caller of
 *   this deployment as one address. The page meters it per reader behind a
 *   Turnstile challenge and a deployment-wide hourly ceiling; an MCP token is
 *   one caller with a loop, and a model asked to narrate a book would spend the
 *   whole hour for everybody. Its document reader is browser-side as well.
 *
 *   The Watermark Remover's *video* and *Gemini image* halves are absent for the
 *   first group's reason rather than this one. The video half demuxes, decodes,
 *   repaints and muxes a clip through the browser's own WebCodecs and a canvas;
 *   the Gemini half decodes a still to pixels in a canvas and encodes a PNG back
 *   out of one.
 *
 *   The Image to 3D Model is the sharpest case of the same seam. Its
 *   mesh builder and its four format writers are the purest code in this
 *   repository — no canvas, no worker, no network, and already driven by
 *   three.js's own loaders in the tests — but they take a heightfield, and the
 *   only way to get one is to decode a picture in a canvas. An adapter that took
 *   a grid of floats instead would be a tool nobody could call, and one that
 *   took a picture would need a decoder this process does not have. Its default
 *   shape adds the Background Remover's second reason on top of the first: the
 *   outline it inflates comes from the same segmentation weights, fetched into
 *   the *reader's* browser and cached there. Neither exists in a request handler, and neither file leaves the
 *   reader's device in the first place. The arithmetic between those two ends —
 *   `watermark-remover/domain/gemini-image.ts` — is pure and would run here
 *   happily; it is the decode and the encode either side of it that cannot, and
 *   an adapter that took raw RGBA and a pixel box would be a tool nobody could
 *   call.
 *
 * The Port Scanner is absent for a different reason again: it is the one tool
 * here whose whole function is to touch somebody else's host on ports they did
 * not offer, and behind a model that can be talked into things, a token is not
 * the protection it looks like.
 *
 * What Is My IP is absent because its answer is a fact about whoever sent the
 * request, and over MCP that is the assistant's host — a hosted client's
 * egress address, not the person asking. An adapter would report somebody
 * else's address as theirs. `/api/ip` answers the same question for a terminal.
 *
 * The Mouse and Keyboard Testers are absent because there is nothing on the
 * other end of an MCP call to test. What they measure is a physical device in
 * a browser — the gaps between presses, the wheel, the pointer reports
 * coalesced between frames, the keys held at once — and an adapter that took
 * a list of timestamps instead would be a tool nobody had a reason to call.
 *
 * The Dead Pixel & Screen Tester is absent for the same reason: what it tests
 * is the panel the reader is looking at, and its whole output is colour on that
 * screen. An MCP call has no screen to paint.
 *
 * The Refresh Rate Tester is absent for the same reason: it times the frames a
 * screen paces in a browser tab, and an MCP call has no screen behind it.
 *
 * The Webcam Tester is absent for the same reason: it opens the reader's own
 * camera through `getUserMedia`, and an MCP call has no camera to open.
 *
 * The Microphone Tester is absent for the same reason: it listens to the
 * reader's own microphone, and an MCP call has no microphone to listen to.
 *
 * The Internet Speed Test is absent for the reason What Is My IP is: run from
 * here it would measure this server's connection, or the assistant host's,
 * and report it as the reader's. Its verdicts and history are pure functions,
 * but without a measurement of the reader's own line there is nothing for them
 * to judge.
 */
export const MCP_TOOLS: readonly McpTool[] = [
    aesCryptTool,
    base64ConvertTool,
    bijoyUnicodeConvertTool,
    bsonConvertTool,
    catalogListTool,
    chmodConvertTool,
    colorConvertTool,
    cronExplainTool,
    curlConvertTool,
    diffCompareTool,
    dockerComposeConvertTool,
    domainInspectTool,
    equationConvertTool,
    hashCompareTool,
    hashDetectTool,
    hashGenerateTool,
    hexEditorDumpTool,
    hexEditorFindTool,
    hexEditorInspectTool,
    htmlMarkdownConvertTool,
    ipGlobeMapTool,
    jsonFormatTool,
    jwtDecodeTool,
    jwtSignTool,
    jwtVerifyTool,
    landMeasurementConvertTool,
    loremGenerateTool,
    markdownAnalyzeTool,
    numberToWordsConvertTool,
    passwordGenerateTool,
    pdfConverterConvertTool,
    photoExifReadTool,
    photoExifStripTool,
    qrGenerateTool,
    regexTestTool,
    rsaCryptTool,
    rsaGenerateTool,
    secretGenerateTool,
    slugCreateTool,
    sortLinesTool,
    sqlFormatterFormatTool,
    subdomainLookupTool,
    textCaseConvertTool,
    timestampConvertTool,
    urlConvertTool,
    urlParseTool,
    uuidGenerateTool,
];
