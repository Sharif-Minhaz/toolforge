import "./globals.css";

/**
 * Reached only by a path the proxy did not localize — a missing file, say — so
 * there is no locale and no shell to render it in. Pages get the localized 404
 * in `[locale]/not-found.tsx`.
 */
export default function RootNotFound() {
    return (
        <html lang="en">
            <body className="bg-background text-foreground grid min-h-dvh place-items-center">
                <p className="font-mono text-sm">404</p>
            </body>
        </html>
    );
}
