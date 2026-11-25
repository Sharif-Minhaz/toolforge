/**
 * `<html data-offline>` while the browser has no connection. Every link to a
 * tool that needs the server carries `data-needs-network`, and one rule in
 * `globals.css` hides those — so the catalogue, which renders on the server,
 * reacts without becoming a client component.
 */
export const OFFLINE_ATTRIBUTE = "data-offline";

/**
 * Runs before paint, beside the sidebar's boot script, so an app opened with no
 * connection never flashes the tools it cannot run.
 */
export const NETWORK_BOOT_SCRIPT = `try{if(!navigator.onLine)document.documentElement.setAttribute("${OFFLINE_ATTRIBUTE}","")}catch(e){}`;

/** What the page tells the worker; `public/sw.js` reads the same shape. */
export type WarmMessage = { readonly type: "warm"; readonly locale: string };
