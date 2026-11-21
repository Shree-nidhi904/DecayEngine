// The header's neon sign (task 4.14, design section 4.4 NeonSign; Req 7.1-7.4).
// Ported from the wireframe's h1.logo and .tag: "Ghosted" in Monoton
// (--logo) with a --sign glow, and the tagline below it.
//
// The sign is the page's only h1 (Req 7.4). The glow is static CSS
// (sign.css); the slow hum runs only inside prefers-reduced-motion:
// no-preference (motion.css), so under reduced motion the sign is steady
// (Req 7.2, 7.3). Engine calls: none.

import "../styles/sign.css"

export interface NeonSignProps {
  /** "Ghosted". */
  title: string
  /** "People you are losing touch with". */
  tagline: string
}

export function NeonSign({ title, tagline }: NeonSignProps) {
  return (
    <div className="gh-sign-wrap">
      <h1 className="gh-sign">{title}</h1>
      <p className="gh-tagline">{tagline}</p>
    </div>
  )
}
