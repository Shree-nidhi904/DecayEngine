// After an answer the dialog's own result line takes focus (feedback list, point 10).
// The answer buttons are gone by then, so focus would fall to the page behind and
// the browser would scroll there. The result line is not in the Tab order
// (tabIndex -1); the Close button after it is. preventScroll keeps the page still.

import { useEffect, useRef } from "react"

export function useFocusResult(done: boolean) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (done) ref.current?.focus({ preventScroll: true })
  }, [done])
  return ref
}
