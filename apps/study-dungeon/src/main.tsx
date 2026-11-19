import React from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import { DoorSplash } from "./components/DoorSplash";
import { createEngine } from "./engine-instance";
import type { FlagStorage } from "./first-run";
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

// The engine is built inside Root through createEngineSafely, so a damaged
// snapshot shows the problem screen instead of a blank page (task 18.3).
createRoot(rootElement).render(
  <React.StrictMode>
    <Root createEngine={createEngine} storage={browserStorage()} />
    <DoorSplash />
  </React.StrictMode>,
);
