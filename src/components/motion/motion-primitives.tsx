"use client";

import { motion, type HTMLMotionProps } from "motion/react";

/**
 * Escape hatch for a one-off animation inside a server component.
 *
 * The `"use client"` above is the whole point: the server component importing
 * this stays a server component, and only this element crosses the boundary.
 * Its children are still rendered on the server and passed through.
 *
 * Reach for `Reveal` or `FadeIn` first — they carry the shared timing and the
 * reduced-motion gate, which this deliberately does not. If you use this
 * directly you own accessibility: animate opacity and transform only, and keep
 * the durations inside `MOTION_DURATION`.
 *
 * Need another tag? Add a sibling export here. Never import `motion/react`
 * into a server component, and never reach for `motion/react-client` — it
 * serialises every animation prop into the RSC payload on each render and
 * cannot call `useReducedMotion()`.
 */
export function MotionDiv(props: HTMLMotionProps<"div">) {
    return <motion.div {...props} />;
}
