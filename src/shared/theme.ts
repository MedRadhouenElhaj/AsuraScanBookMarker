import themeCss from './theme.css?raw';

// CSS is the source of truth, including consumers without a DOM (the service worker).
const accent = themeCss.match(/--accent:\s*(#[\da-f]{6})\s*;/i)?.[1];
if (!accent) throw new Error('The shared theme must define a six-digit accent color.');

export const themeAccent = accent;
export { themeCss };
