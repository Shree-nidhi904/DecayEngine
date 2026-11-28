// The web app manifest, built from a few options so both apps share one shape.

export interface ManifestOptions {
  name: string
  shortName: string
  description: string
  /** Colour of the browser's title bar and splash screen. */
  themeColor: string
  backgroundColor: string
  /** Where the app is served from, with a trailing slash. Defaults to "/". */
  base?: string
}

export interface Manifest {
  name: string
  short_name: string
  description: string
  start_url: string
  scope: string
  id: string
  display: "standalone"
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; type: "image/png"; purpose?: "any" | "maskable" }[]
}

export function buildManifest(options: ManifestOptions): Manifest {
  const base = options.base ?? "/"
  return {
    name: options.name,
    short_name: options.shortName,
    description: options.description,
    id: base,
    start_url: base,
    scope: base,
    display: "standalone",
    theme_color: options.themeColor,
    background_color: options.backgroundColor,
    icons: [
      { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
