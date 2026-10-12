import React, { useState, useEffect } from '../vendor/react-runtime.js';
import { hydrateRoot } from '../vendor/react-runtime.js';
import { GlyphokuStudio } from './components/glyphoku/studio.js';
import { preferredTheme } from './lib/glyphoku/client.js';
try {
    document.documentElement.dataset.theme = preferredTheme(window.localStorage, window.matchMedia('(prefers-color-scheme: dark)').matches);
}
catch {
    document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function Bootstrap() { const [ready, setReady] = useState(false); useEffect(() => setReady(true), []); return ready ? React.createElement(GlyphokuStudio, null) : React.createElement("div", null); }
const root = document.getElementById('root');
if (!root)
    throw Error('Root element missing');
hydrateRoot(root, React.createElement(Bootstrap, null));
