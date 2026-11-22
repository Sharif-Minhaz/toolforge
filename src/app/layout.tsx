import type { ReactNode } from "react";

/**
 * Pass-through. The real root layout — `<html>`, fonts, providers — is
 * `[locale]/layout.tsx`, because `<html lang>` depends on the locale. This file
 * exists only because `not-found.tsx` beside it needs a layout to render in.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
    return children;
}
