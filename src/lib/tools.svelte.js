import { BRUSH_SIZES } from '../../shared/constants.js';

// Current drawing tool, shared by the toolbar and the canvas.
export const tools = $state({
  tool: 'brush', // brush | eraser | fill
  color: '#000000',
  size: BRUSH_SIZES[1],
});
