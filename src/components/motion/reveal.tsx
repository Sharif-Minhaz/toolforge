"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.22, 0.61, 0.36, 1] as const;

type MotionWrapperProps = {
    children: ReactNode;
    className?: string;
    /** Seconds. Keep stagger steps under ~0.06s so a grid never feels slow. */
    delay?: number;
    y?: number;
};

/** Fades content up the first time it scrolls into view. */
export function Reveal({ children, className, delay = 0, y = 14 }: MotionWrapperProps) {
    const reduceMotion = useReducedMotion();

    if (reduceMotion) {
        return <div className={className}>{children}</div>;
    }

    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-72px" }}
            transition={{ duration: 0.28, delay, ease: EASE }}
        >
            {children}
        </motion.div>
    );
}

/** Fades content in on mount — for above-the-fold content that never scrolls in. */
export function FadeIn({ children, className, delay = 0, y = 10 }: MotionWrapperProps) {
    const reduceMotion = useReducedMotion();

    if (reduceMotion) {
        return <div className={className}>{children}</div>;
    }

    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay, ease: EASE }}
        >
            {children}
        </motion.div>
    );
}
