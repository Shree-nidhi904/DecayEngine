// The words of the notification you get while the app is closed.
//
// They are generic on purpose: the server that sends the push never learns what
// is in your data, so the text cannot name a person or a fact. The app name is
// the title; the body is one calm sentence. (While the tab is open and hidden,
// the other notification, notify.ts, names the change; this one cannot.)
//

export const pushNotification = {
  title: "Ghosted",
  body: "A window on your street is about to change. Open Ghosted to take a look.",
} as const
