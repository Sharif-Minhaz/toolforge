import { notFound } from "next/navigation";

/**
 * The proxy rewrites every page path under `app/[locale]`, so a path matching
 * no route lands here and gets the localized 404 inside the app shell, rather
 * than the bare one in `app/not-found.tsx`.
 */
export default function MissingPage() {
    notFound();
}
