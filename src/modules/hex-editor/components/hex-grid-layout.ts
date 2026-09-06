import { ROW_HEIGHT } from "../domain/constants";

/**
 * The one grid template the header and every row share.
 *
 * Thirty-four columns: the offset, sixteen hex cells, a gutter, sixteen ASCII
 * cells. Declared once as a frozen object so the header and the rows cannot
 * drift apart, and so React sees the same style reference on every render
 * instead of a fresh object per row per frame.
 */
export const HEX_GRID_STYLE = Object.freeze({
    gridTemplateColumns: "6.5rem repeat(16, 1.65rem) 1rem repeat(16, 0.9rem)",
    height: `${ROW_HEIGHT}px`,
});

/**
 * Below this the grid scrolls sideways inside its own pane rather than pushing
 * the page wide — 390 px is a third of a row, and a hex dump that reflows is not
 * a hex dump.
 */
export const HEX_GRID_MIN_WIDTH = "48.5rem";

/**
 * The grid's element id.
 *
 * Only one grid is ever mounted — full screen moves the editor rather than
 * copying it — so an id is enough for the find bar to hand focus back to the
 * bytes when it closes, without threading a ref through a dialog that remounts
 * everything under it.
 */
export const HEX_GRID_ID = "hex-editor-grid";
