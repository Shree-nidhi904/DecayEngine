import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { engine } from "./engine-instance";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error('Study Dungeon: no element with id "root" found in index.html.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App engine={engine} />
  </React.StrictMode>,
);
