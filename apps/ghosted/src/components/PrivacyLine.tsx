// The privacy line below the lists (task 5.4, design section 4.4; Req 15.1,
// 15.2). It says the names are made up until the user adds, imports or
// restores people of their own (OWN_PEOPLE_FLAG, read by the App with
// hasOwnPeople). Engine calls: none.

import { privacyText } from "../wording"
import "../styles/layout.css"

export interface PrivacyLineProps {
  /** hasOwnPeople(storage). */
  ownPeople: boolean
}

export function PrivacyLine({ ownPeople }: PrivacyLineProps) {
  return <p className="gh-privacy">{ownPeople ? privacyText.own : privacyText.sample}</p>
}
