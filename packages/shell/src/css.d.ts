// Lets the shell's own typecheck accept side-effect CSS imports
// (import "../shell.css"). Vite bundles the CSS into the app; tests stub it.
declare module "*.css";
