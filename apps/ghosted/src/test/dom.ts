// Small DOM helpers shared by the component tests.

/** A window pane's --lit, as written in its inline style. */
export function litOf(el: HTMLElement): string {
  const fromStyle = el.style.getPropertyValue("--lit")
  if (fromStyle !== "") return fromStyle.trim()
  const match = /--lit:\s*([^;]+)/.exec(el.getAttribute("style") ?? "")
  if (match === null) throw new Error("the pane has no --lit")
  return match[1]!.trim()
}

/** The one element matching `selector` inside `root`; throws when there is none. */
export function one<E extends Element = HTMLElement>(root: ParentNode, selector: string): E {
  const el = root.querySelector<E>(selector)
  if (el === null) throw new Error(`nothing matches ${selector}`)
  return el
}
