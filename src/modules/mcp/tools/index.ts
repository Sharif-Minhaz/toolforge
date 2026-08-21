import type { McpTool } from "../types";
import { aesCryptTool } from "./aes";
import { base64ConvertTool } from "./base64";
import { bsonConvertTool } from "./bson";
import { catalogListTool } from "./catalog";
import { colorConvertTool } from "./color";
import { cronExplainTool } from "./cron";
import { curlConvertTool } from "./curl";
import { diffCompareTool } from "./diff";
import { domainInspectTool } from "./domain-inspector";
import { equationConvertTool } from "./equation";
import { hashCompareTool, hashDetectTool, hashGenerateTool } from "./hash";
import { htmlMarkdownConvertTool } from "./html-markdown";
import { jsonFormatTool } from "./json";
import { jwtDecodeTool, jwtSignTool, jwtVerifyTool } from "./jwt";
import { loremGenerateTool } from "./lorem";
import { markdownAnalyzeTool } from "./markdown";
import { passwordGenerateTool } from "./password";
import { qrGenerateTool } from "./qr";
import { regexTestTool } from "./regex";
import { rsaCryptTool, rsaGenerateTool } from "./rsa";
import { secretGenerateTool } from "./secret";
import { slugCreateTool } from "./slug";
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
 * - **The image tools** — compressor, converter, resizer, blur placeholder, and
 *   the Background Remover. They decode pixels in a canvas and re-encode them
 *   through WebAssembly codecs built for the browser. There is no canvas in a
 *   request handler, and a server-side reimplementation would be a second
 *   encoder to keep in step with the one on the page. The Background Remover
 *   adds a second reason on top of the first: its segmentation weights are
 *   fetched into the *reader's* browser and cached there, so running it here
 *   would move a hundred-megabyte download and the inference that follows onto
 *   this deployment for every call — the tool is local precisely so that cost
 *   is not ours to pay. `toolforge_catalog_list` returns their addresses so a
 *   caller can send somebody to the page instead.
 * - **The studios** — Mock Server, JSON Server, GraphQL Server, and the URL
 *   Shortener. Every one of them mints a public address and stores what is
 *   posted to it, against an ownership model built on browser cookies. An MCP
 *   caller has no cookie jar and no way to prove it owns what it created, so
 *   exposing creation here would mint unreclaimable resources.
 * - **The AI tools** — text and image detectors, watermark remover, and the
 *   Equation converter's *image* half. They spend a third-party API budget per
 *   call. That is a decision about money rather than about capability, and it
 *   belongs to whoever is paying rather than to this file. Note the seam: the
 *   Equation tool's text half is `toolforge_equation_convert` below and runs
 *   here like any other offline tool, because turning `x2 + y2 = r2` into LaTeX
 *   costs nothing. Only reading a picture is withheld — a model that wants an
 *   equation transcribed already has eyes of its own.
 *
 * The Port Scanner is absent for a different reason again: it is the one tool
 * here whose whole function is to touch somebody else's host on ports they did
 * not offer, and behind a model that can be talked into things, a token is not
 * the protection it looks like.
 */
export const MCP_TOOLS: readonly McpTool[] = [
    aesCryptTool,
    base64ConvertTool,
    bsonConvertTool,
    catalogListTool,
    colorConvertTool,
    cronExplainTool,
    curlConvertTool,
    diffCompareTool,
    domainInspectTool,
    equationConvertTool,
    hashCompareTool,
    hashDetectTool,
    hashGenerateTool,
    htmlMarkdownConvertTool,
    jsonFormatTool,
    jwtDecodeTool,
    jwtSignTool,
    jwtVerifyTool,
    loremGenerateTool,
    markdownAnalyzeTool,
    passwordGenerateTool,
    qrGenerateTool,
    regexTestTool,
    rsaCryptTool,
    rsaGenerateTool,
    secretGenerateTool,
    slugCreateTool,
    textCaseConvertTool,
    timestampConvertTool,
    urlConvertTool,
    urlParseTool,
    uuidGenerateTool,
];
