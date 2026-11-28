// The service worker's source text, filled in at build time.
//
// What it does:
// - install: stores every build file (the precache list) under a cache named
//   for this build, so the app opens offline.
// - activate: deletes caches from older builds and takes over open pages.
// - fetch (same-origin GET only): a page load tries the network first and
//   falls back to the stored page when offline; every other file comes from
//   the cache first, then the network (build files are named by content hash).
// - push: shows the notification a push message describes ({title, body, tag}),
//   unless the app is already on screen. A click on it brings the app forward.
// - update: a new worker waits until the page sends "SKIP_WAITING" (the user
//   pressed "Update"), so a tab is never swapped under someone mid-edit.
//
// It never touches localStorage (workers cannot) and sends nothing anywhere:
// no request goes out except the page's own files from its own origin.

export interface ServiceWorkerOptions {
  /** Changes with every build; names the cache. */
  version: string
  /** Same-origin paths to store at install, for example ["/", "/assets/index-ab12.js"]. */
  precache: string[]
  /** The page served for navigations when offline. */
  fallback: string
}

export function serviceWorkerSource({ version, precache, fallback }: ServiceWorkerOptions): string {
  return `// Generated at build time by @decay-engine/pwa. Do not edit.
const CACHE = ${JSON.stringify(`decay-engine-${version}`)};
const PRECACHE = ${JSON.stringify(precache)};
const FALLBACK = ${JSON.stringify(fallback)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key.startsWith("decay-engine-")).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = typeof data.title === "string" && data.title !== "" ? data.title : "Decay Engine";
  const body = typeof data.body === "string" ? data.body : "Open the app to take a look.";
  const tag = typeof data.tag === "string" && data.tag !== "" ? data.tag : "decay-engine-due";
  const icon = self.registration.scope + "icons/icon-192.png";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // The app is open and visible: it already shows what changed.
      if (windows.some((w) => w.visibilityState === "visible")) return undefined;
      // renotify: a push with the same tag replaces the old notification AND alerts again;
      // without it the replacement is silent and looks like nothing arrived.
      return self.registration.showNotification(title, { body, tag, icon, badge: icon, renotify: true });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) return w.focus();
      }
      return self.clients.openWindow(self.registration.scope);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(FALLBACK, copy));
          return response;
        })
        .catch(() => caches.match(FALLBACK).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
`
}
