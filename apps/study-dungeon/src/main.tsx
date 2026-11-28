import React from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import { DoorSplash } from "./components/DoorSplash";
import { createEngine } from "./engine-instance";
import { registerApp } from "./pwa";
import { readTendId, withoutTend } from "./tend-link";
import type { FlagStorage } from "./first-run";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/pirata-one/400.css";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/400-italic.css";
import "@fontsource/spectral/600.css";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error('Study Dungeon: no element with id "root" found in index.html.');
}

/** window.localStorage, or null when the browser blocks it (reading it can throw). */
function browserStorage(): FlagStorage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

// The page always starts at the top (feedback list, point 10): the browser does not
// bring back an old scroll position on a reload or when the page is reopened.
try {
  window.history.scrollRestoration = "manual";
} catch {
  // Older browsers: the page may start where it was left.
}
window.scrollTo(0, 0);

// A link from Life Triage (`?tend=<id>`) opens that fact; the parameter is then removed from the address.
const tendId = readTendId(window.location.search);
if (tendId !== null) {
  try {
    window.history.replaceState(null, "", `${window.location.pathname}${withoutTend(window.location.search)}${window.location.hash}`);
  } catch {
    // The address stays as it is; the fact still opens.
  }
}

// The engine is built inside Root through createEngineSafely, so a damaged
// snapshot shows the problem screen instead of a blank page (task 18.3).
createRoot(rootElement).render(
  <React.StrictMode>
    {/* Task L6: the first look after the first sample load (Requirement 25.11). */}
    <Root createEngine={createEngine} storage={browserStorage()} appProps={{ tendId }} />
    <DoorSplash />
  </React.StrictMode>,
);

// Offline support: registers the service worker in production builds only.
registerApp(import.meta.env.PROD, import.meta.env.BASE_URL);
