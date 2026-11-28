// The privacy line below the lists (task 5.4, design section 4.4; Req 15.1,
// 15.2). It says the names are made up until the user adds, imports or
// restores people of their own (OWN_PEOPLE_FLAG, read by the App with
// hasOwnPeople). Engine calls: none.

import { hasStoredSession } from "../cloud-link"
import { privacyText } from "../wording"
import "../styles/layout.css"

/**
 * Said after the line while the person is signed in to sync, so "stays in this
 * browser" does not stay true only by omission (amendment to Req 15).
 */
export const syncedPrivacyNote = "You are signed in to sync, so a copy is also kept in your account."

/** Whether an earlier visit or this one left a sign-in. Reads the browser's storage only. */
function signedInToSync(): boolean {
  return typeof window !== "undefined" && hasStoredSession(window.localStorage)
}

export interface PrivacyLineProps {
  /** hasOwnPeople(storage). */
  ownPeople: boolean
  /** Whether the person is signed in to sync. Defaults to looking for a stored sign-in. */
  signedIn?: boolean
}

export function PrivacyLine({ ownPeople, signedIn = signedInToSync() }: PrivacyLineProps) {
  const line = ownPeople ? privacyText.own : privacyText.sample
  return <p className="gh-privacy">{signedIn ? `${line} ${syncedPrivacyNote}` : line}</p>
}
