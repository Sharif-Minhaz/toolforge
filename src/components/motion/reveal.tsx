"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { MOTION_DURATION, MOTION_EASE } from "./motion-tokens";

/**
 * Tags a wrapper may render as.
 *
 * A wrapper placed directly inside `<ul>` must be an `<li>`. A `<div>` there is
 * invalid HTML and strips the list semantics a screen reader announces.
 */
type MotionWrapperTag = "div" | "li" | "section" | "article";

type MotionWrapperProps = {
    children: ReactNode;
    className?: string;
    /** Seconds. Use `staggerDelay(index)` rather than hand-rolling arithmetic. */
    delay?: number;
    y?: number;
    /** Element to render. Defaults to a div. */
    as?: MotionWrapperTag;
};

/** Fades content up the first time it scrolls into view. */
export function Reveal({
    children,
    className,
    delay = 0,
    y = 14,
    as: Tag = "div",
}: MotionWrapperProps) {
    const reduceMotion = useReducedMotion();

    if (reduceMotion) {
        return <Tag className={className}>{children}</Tag>;
    }

    const Animated = motion[Tag];

    return (
        <Animated
            className={className}
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-72px" }}
            transition={{ duration: MOTION_DURATION.reveal, delay, ease: MOTION_EASE }}
        >
            {children}
        </Animated>
    );
}

/** Fades content in on mount — for above-the-fold content that never scrolls in. */
export function FadeIn({
    children,
    className,
    delay = 0,
    y = 10,
    as: Tag = "div",
}: MotionWrapperProps) {
    const reduceMotion = useReducedMotion();

    if (reduceMotion) {
        return <Tag className={className}>{children}</Tag>;
    }

    const Animated = motion[Tag];

    return (
        <Animated
            className={className}
            initial={{ opacity: 0, y }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION_DURATION.enter, delay, ease: MOTION_EASE }}
        >
            {children}
        </Animated>
    );
}
