/**
 * The slice of Cloudflare's Turnstile browser API this tool uses. Declared
 * locally rather than pulled in as a dependency: the script is loaded from
 * Cloudflare at runtime, so a package would only be types anyway.
 */

export type TurnstileTheme = "light" | "dark" | "auto";

export type TurnstileRenderOptions = {
    sitekey: string;
    action?: string;
    theme?: TurnstileTheme;
    size?: "normal" | "flexible" | "compact";
    /**
     * `interaction-only` keeps the widget out of the layout unless Cloudflare
     * decides a human needs to click something.
     */
    appearance?: "always" | "execute" | "interaction-only";
    language?: string;
    /** No form to submit, so the hidden input would be dead weight. */
    "response-field"?: boolean;
    callback?: (token: string) => void;
    "error-callback"?: (code?: string) => void;
    "expired-callback"?: () => void;
    "timeout-callback"?: () => void;
};

export type TurnstileApi = {
    render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
    reset(widgetId?: string): void;
    remove(widgetId?: string): void;
};

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}
