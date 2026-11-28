"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { srgbToLinear } from "../domain/glb";
import type { Mesh } from "../types";

/**
 * The mesh itself, turning, rather than a picture of it.
 *
 * Worth the WebGL context: a blocked-out object is judged from every side — a
 * spout that points the wrong way is invisible from the front — and a still
 * image would hide exactly what the reader needs to check before printing. It
 * loads through `next/dynamic` from the workbench, so three stays out of the
 * bundle of every other page.
 *
 * Everything here is imperative and lives in one effect, because three owns a
 * render loop and a GPU context — neither of which React should be asked to
 * reconcile. The effect's cleanup disposes every one of them; a preview that
 * leaked a context would take the whole page's WebGL down after sixteen picks.
 */

type ModelPreviewProps = {
    readonly mesh: Mesh;
    readonly className?: string;
};

/** How many squares across the ground plane, and how far past the model it runs. */
const GROUND_DIVISIONS = 24;
const GROUND_SPAN_FACTOR = 3.2;

/** Enough of the model to fit in frame with room to orbit. */
const CAMERA_DISTANCE_FACTOR = 1.9;

/**
 * Whether this browser will give the page a 3D context at all.
 *
 * Probed by doing the thing rather than by reading a property: `WebGL2RenderingContext`
 * exists on `window` in browsers that then refuse a context — a blocklisted
 * driver, a hardened profile, too many live contexts on the page already. The
 * probe's own context is handed straight back through `WEBGL_lose_context`,
 * because contexts are a small fixed pool and leaking one per render would
 * eventually be the thing that makes the answer false.
 */
function canRenderWebGl(): boolean {
    try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");

        context?.getExtension("WEBGL_lose_context")?.loseContext();

        return context !== null;
    } catch {
        return false;
    }
}

export default function ModelPreview({ mesh, className }: ModelPreviewProps) {
    const t = useTranslations("imageTo3d.workbench");
    const containerRef = useRef<HTMLDivElement>(null);

    // Whether the browser has WebGL is something the server cannot know, so the
    // server pass and the hydration pass both assume it does and the answer is
    // derived once hydration is over. Deriving it during render rather than
    // setting it from an effect is what keeps this out of
    // `react-hooks/set-state-in-effect`.
    const hydrated = useIsHydrated();
    const supported = useMemo(() => !hydrated || canRenderWebGl(), [hydrated]);

    useEffect(() => {
        const container = containerRef.current;

        if (container === null || !supported) {
            return;
        }

        let renderer: THREE.WebGLRenderer;

        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch (error) {
            // The probe above already asked this browser the same question and
            // was told yes, so this is close to unreachable — logged rather than
            // given a second reader-facing state that says the same thing.
            logEvent("error", "image-to-3d.preview", { detail: describeError(error) });

            return;
        }

        const geometry = new THREE.BufferGeometry();

        // Positions, normals and indices are handed over as they are rather
        // than copied: this component never writes to them.
        geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
        // Each vertex carries its part's colour. three reads vertex colours as
        // linear and the mesh holds sRGB bytes, so they are converted here —
        // the same conversion the GLB writer applies to each part's material,
        // which is what makes the preview and the file agree.
        geometry.setAttribute(
            "color",
            new THREE.BufferAttribute(Float32Array.from(mesh.colors, srgbToLinear), 3),
        );
        geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
        geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            metalness: 0,
            roughness: 0.7,
            // Every part is closed and wound outward, so a back face is only
            // ever seen through an overlap — and hiding it there is right.
            side: THREE.FrontSide,
        });

        const model = new THREE.Mesh(geometry, material);
        const scene = new THREE.Scene();

        scene.add(model);
        // Two lights, one soft and one directional. A blockout is only legible
        // through its shading — a flat ambient light turns a lathed body and a
        // cylinder into the same silhouette.
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2.1));

        const key = new THREE.DirectionalLight(0xffffff, 2.4);

        key.position.set(-1, 1.4, 2);
        scene.add(key);

        const bounds = geometry.boundingSphere;
        const radius = bounds?.radius ?? 100;
        const centre = bounds?.center ?? new THREE.Vector3();

        /**
         * A lined ground, so a turn reads as a turn.
         *
         * Without one there is no fixed reference in the frame: the model
         * rotates against a flat colour, and past a certain angle a reader
         * cannot tell whether it moved or the light did. The grid sits under the
         * model's own lowest point, which the builder puts at zero.
         */
        geometry.computeBoundingBox();

        const floor = geometry.boundingBox?.min.y ?? -radius;
        const ground = new THREE.GridHelper(
            radius * GROUND_SPAN_FACTOR,
            GROUND_DIVISIONS,
            0x8a8a99,
            0x8a8a99,
        );

        ground.position.set(centre.x, floor, centre.z);
        // Both grid materials are the same object here; fading it keeps the
        // ground readable on a light page and on a dark one without a second
        // palette to keep in step.
        const groundMaterial = ground.material as THREE.Material;

        groundMaterial.transparent = true;
        groundMaterial.opacity = 0.35;

        scene.add(ground);

        const camera = new THREE.PerspectiveCamera(38, 1, radius / 100, radius * 60);

        camera.position.set(
            centre.x,
            centre.y + radius * 0.45,
            centre.z + radius * CAMERA_DISTANCE_FACTOR,
        );

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.classList.add("size-full", "touch-none", "outline-none");
        container.append(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);

        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minDistance = radius * 1.05;
        controls.maxDistance = radius * 12;
        // Aimed at the model rather than at the origin. The model stands on
        // zero, so orbiting the origin would swing it around the bottom edge
        // of the frame instead of turning it in place.
        controls.target.copy(centre);
        // The full sphere, both ways round. The defaults stop a little short of
        // straight up and straight down, which reads as the drag sticking.
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI;
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
        controls.update();

        function resize() {
            const width = container?.clientWidth ?? 0;
            const height = container?.clientHeight ?? 0;

            if (width === 0 || height === 0) {
                return;
            }

            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }

        resize();

        const observer = new ResizeObserver(resize);

        observer.observe(container);

        let frame = 0;

        function draw() {
            frame = requestAnimationFrame(draw);
            controls.update();
            renderer.render(scene, camera);
        }

        draw();

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            controls.dispose();
            ground.geometry.dispose();
            groundMaterial.dispose();
            geometry.dispose();
            material.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [mesh, supported]);

    if (!supported) {
        return (
            <div
                className={cn(
                    "bg-muted/40 ring-border/70 text-muted-foreground flex items-center justify-center rounded-xl p-6 text-center text-xs ring-1 ring-inset",
                    className,
                )}
            >
                <span className="max-w-[38ch] leading-[1.5]">{t("previewUnavailable")}</span>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            // A canvas is a picture to a screen reader, and this one has a text
            // equivalent above it in the summary line — so it is labelled
            // rather than left as an unnamed interactive region.
            role="img"
            aria-label={t("previewHint")}
            className={cn("bg-muted/40 ring-border/70 rounded-xl ring-1 ring-inset", className)}
        />
    );
}
