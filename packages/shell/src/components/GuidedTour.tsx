// A help button (bottom right) that walks through the page: one part is lit at a time and a
// card beside it says what it is for. Back, Next and Done; Escape closes. A step whose
// part is not on the page (for example before there are facts) is skipped.
// No stored state: it opens only when the button is pressed.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ThemeProps } from "../types";
import { shellStyle } from "../theme";
import "../shell.css";

export interface GuidedTourStep {
  /** A CSS selector for the part to light. */
  selector: string;
  title: string;
  text: string;
}

export interface GuidedTourWording {
  /** The help button's name, e.g. "Show me around". */
  open: string;
  next: string;
  back: string;
  done: string;
  /** "Step {n} of {total}": the two marks are replaced. */
  progress: string;
}

export interface GuidedTourProps {
  steps: readonly GuidedTourStep[];
  theme: ThemeProps;
  wording: GuidedTourWording;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const CARD_W = 320;
const MARGIN = 12;

function findTarget(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : el;
}

export function GuidedTour({ steps, theme, wording }: GuidedTourProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(160);
  const cardRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  /** The steps whose part is on the page now, recomputed each time the tour opens. */
  const [live, setLive] = useState<readonly GuidedTourStep[]>(steps);
  const start = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const present = steps.filter((s) => findTarget(s.selector) !== null);
    setLive(present.length > 0 ? present : steps);
    setIndex(0);
    setOpen(true);
  }, [steps]);
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus({ preventScroll: true });
  }, []);

  const step = live[index];

  const measure = useCallback(() => {
    if (step === undefined) return;
    const el = findTarget(step.selector);
    if (el === null) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Bring the part into view (above the fixed dock), then measure it.
  useLayoutEffect(() => {
    if (!open || step === undefined) return;
    const el = findTarget(step.selector);
    if (el !== null) {
      const r = el.getBoundingClientRect();
      const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dock-h")) || 0;
      const room = window.innerHeight - dock;
      if (r.top < 60 || r.bottom > room) {
        el.scrollIntoView({ block: r.height > room * 0.7 ? "start" : "center", behavior: "instant" as ScrollBehavior });
      }
    }
    measure();
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    const again = () => measure();
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    return () => {
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
    };
  }, [open, measure]);

  useLayoutEffect(() => {
    if (open && cardRef.current !== null) setCardH(cardRef.current.getBoundingClientRect().height);
  }, [open, index, box]);

  // Escape closes; the primary button gets focus on every step.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    cardRef.current?.querySelector<HTMLElement>("[data-tour-primary]")?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, close]);

  const cardStyle = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_W, vw - MARGIN * 2);
    if (box === null) {
      return { top: Math.max(MARGIN, (vh - cardH) / 2), left: Math.max(MARGIN, (vw - width) / 2), width };
    }
    const below = box.top + box.height + PAD + MARGIN;
    const above = box.top - PAD - MARGIN - cardH;
    let top: number;
    if (below + cardH <= vh - MARGIN) top = below;
    else if (above >= MARGIN) top = above;
    else top = Math.max(MARGIN, Math.min(vh - cardH - MARGIN, box.top + MARGIN)); // over the part, as a last resort
    const left = Math.max(MARGIN, Math.min(vw - width - MARGIN, box.left + box.width / 2 - width / 2));
    return { top, left, width };
  }, [box, cardH]);

  const last = index >= live.length - 1;

  return (
    <div className="shell-tour" style={shellStyle(theme)}>
      <button type="button" className="shell-tour-help" aria-label={wording.open} title={wording.open} onClick={start}>
        <span aria-hidden="true">?</span>
      </button>
      {open && step !== undefined && (
        <div className="shell-tour-layer">
          {box !== null ? (
            <div
              className="shell-tour-spot"
              aria-hidden="true"
              style={{
                top: box.top - PAD,
                left: box.left - PAD,
                width: box.width + PAD * 2,
                height: box.height + PAD * 2,
              }}
            />
          ) : (
            <div className="shell-tour-shade" aria-hidden="true" />
          )}
          <div
            ref={cardRef}
            className="shell-tour-card"
            role="dialog"
            aria-label={step.title}
            style={cardStyle}
          >
            <p className="shell-tour-progress">{wording.progress.replace("{n}", String(index + 1)).replace("{total}", String(live.length))}</p>
            <h2 className="shell-tour-title">{step.title}</h2>
            <p className="shell-tour-text">{step.text}</p>
            <div className="shell-tour-actions">
              <button type="button" className="shell-button shell-button-quiet" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
                {wording.back}
              </button>
              <button
                type="button"
                className="shell-button shell-button-primary"
                data-tour-primary=""
                onClick={() => (last ? close() : setIndex(index + 1))}
              >
                {last ? wording.done : wording.next}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
