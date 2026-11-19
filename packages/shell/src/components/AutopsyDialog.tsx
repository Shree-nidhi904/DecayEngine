import { useEffect, useId, useRef, type ReactNode } from "react";
import type { AutopsyWording, StateIcons, ThemeProps, WordingProps } from "../types";
import { shellStyle } from "../theme";
import "../shell.css";

/** One point of the health line: health (0-100) at a time in ms. */
export interface AutopsyChartPoint {
  at: number;
  health: number;
}

/** One tend in the life shown, marked by whether it was right. */
export interface AutopsyTendMark {
  at: number;
  correct: boolean;
}

export interface AutopsyDialogProps {
  theme: ThemeProps;
  wording: WordingProps;
  /** Only `dead` is used: the icon beside the title. */
  icons: StateIcons;
  /** Why the item mattered. Not shown when missing or blank. */
  epitaph?: string;
  /** Cause-of-death sentences from the app, shown in order, one paragraph each. */
  causeSentences: readonly string[];
  /** The health line, oldest first. Two points at the same time draw a jump (a tend). */
  points: readonly AutopsyChartPoint[];
  /** One mark per tend; only those within the line's time span are drawn. */
  tends: readonly AutopsyTendMark[];
  /** The app's thresholds: the weak and dead bands are shaded below them. */
  thresholds: { weak: number; dead: number };
  /** Formats a time for the chart's axis and its summary. Supplied by the app. */
  formatDate: (ms: number) => string;
  /** Closes the dialog (the close button and Escape). */
  onClose: () => void;
  /** Resurrect the item; the button says wording.actions.resurrect. No button when omitted. */
  onResurrect?: () => void;
  /**
   * Disables the resurrect button (for example while previewing). It stays
   * visible and focusable, is marked aria-disabled, and ignores clicks.
   */
  resurrectDisabled?: boolean;
  /** Why the resurrect button is disabled: its title and description. */
  resurrectDisabledReason?: string;
}

/** The chart's viewBox size. */
export const AUTOPSY_CHART_WIDTH = 320;
export const AUTOPSY_CHART_HEIGHT = 190;

// Plot area inside the viewBox; below it, a row of tend marks, then the dates.
const PLOT = { left: 6, top: 6, width: AUTOPSY_CHART_WIDTH - 12, height: 140 };
const MARK_Y = PLOT.top + PLOT.height + 14;
const DATE_Y = AUTOPSY_CHART_HEIGHT - 6;

const round2 = (n: number) => Number(n.toFixed(2));
const clampHealth = (h: number) => Math.min(100, Math.max(0, h));

/** A tend marked right: a filled circle. */
function RightMark() {
  return <circle r={5} className="shell-autopsy-mark-right" />;
}

/** A tend marked wrong: a cross. Shape, not colour, tells it from a right one. */
function WrongMark() {
  return <path d="M-4.5,-4.5L4.5,4.5M-4.5,4.5L4.5,-4.5" className="shell-autopsy-mark-wrong" />;
}

function legendShape(children: ReactNode) {
  return (
    <svg className="shell-autopsy-legend-shape" viewBox="-7 -7 14 14" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

interface ChartProps {
  points: readonly AutopsyChartPoint[];
  tends: readonly AutopsyTendMark[];
  thresholds: { weak: number; dead: number };
  formatDate: (ms: number) => string;
  text: AutopsyWording;
  titleId: string;
}

function AutopsyChart({ points, tends, thresholds, formatDate, text, titleId }: ChartProps) {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const from = first.at;
  const to = last.at;
  const span = Math.max(1, to - from);
  const x = (at: number) => round2(PLOT.left + ((at - from) / span) * PLOT.width);
  const y = (health: number) => round2(PLOT.top + (1 - clampHealth(health) / 100) * PLOT.height);

  const shown = tends.filter((t) => t.at >= from && t.at <= to);
  const right = shown.filter((t) => t.correct).length;
  const label = text.chartLabel({
    from: formatDate(from),
    to: formatDate(to),
    startHealth: first.health,
    endHealth: last.health,
    right,
    wrong: shown.length - right,
  });

  return (
    <figure className="shell-autopsy-chart">
      <h3 id={titleId} className="shell-autopsy-heading">
        {text.chartTitle}
      </h3>
      <svg
        className="shell-autopsy-svg"
        viewBox={`0 0 ${AUTOPSY_CHART_WIDTH} ${AUTOPSY_CHART_HEIGHT}`}
        role="img"
        aria-label={label}
        focusable="false"
      >
        <rect
          className="shell-autopsy-band"
          data-band="weak"
          x={PLOT.left}
          y={y(thresholds.weak)}
          width={PLOT.width}
          height={round2(y(thresholds.dead) - y(thresholds.weak))}
        />
        <rect
          className="shell-autopsy-band"
          data-band="dead"
          x={PLOT.left}
          y={y(thresholds.dead)}
          width={PLOT.width}
          height={round2(y(0) - y(thresholds.dead))}
        />
        <rect
          className="shell-autopsy-frame"
          x={PLOT.left}
          y={PLOT.top}
          width={PLOT.width}
          height={PLOT.height}
        />
        <polyline
          className="shell-autopsy-line"
          points={points.map((p) => `${x(p.at)},${y(p.health)}`).join(" ")}
        />
        {shown.map((t, index) => (
          <g key={index} data-mark={t.correct ? "right" : "wrong"} transform={`translate(${x(t.at)},${MARK_Y})`}>
            <line className="shell-autopsy-guide" x1={0} y1={-6} x2={0} y2={PLOT.top - MARK_Y} />
            {t.correct ? <RightMark /> : <WrongMark />}
          </g>
        ))}
        <text className="shell-autopsy-axis" x={PLOT.left} y={DATE_Y}>
          {formatDate(from)}
        </text>
        <text className="shell-autopsy-axis" x={PLOT.left + PLOT.width} y={DATE_Y} textAnchor="end">
          {formatDate(to)}
        </text>
      </svg>
      <ul className="shell-autopsy-legend">
        <li data-legend="weak">
          {legendShape(<rect className="shell-autopsy-band" data-band="weak" x={-6} y={-6} width={12} height={12} />)}
          {text.weakBand(thresholds.weak)}
        </li>
        <li data-legend="dead">
          {legendShape(<rect className="shell-autopsy-band" data-band="dead" x={-6} y={-6} width={12} height={12} />)}
          {text.deadBand(thresholds.dead)}
        </li>
        <li data-legend="right">
          {legendShape(<RightMark />)}
          {text.markRight}
        </li>
        <li data-legend="wrong">
          {legendShape(<WrongMark />)}
          {text.markWrong}
        </li>
      </ul>
    </figure>
  );
}

/**
 * The autopsy of a dead item: the epitaph, a health-over-time chart of its
 * last life, and the app's cause-of-death sentences. A native modal dialog;
 * Escape closes it. Read-only: only the optional resurrect button writes,
 * through the app.
 *
 * The chart is inline SVG: the health line, shaded bands below the weak and
 * dead thresholds, and a mark per tend (a circle when right, a cross when
 * wrong), with a legend in words. Its aria-label sums it up in words from
 * wording.autopsy.chartLabel. Every word comes from the wording.
 */
export function AutopsyDialog({
  theme,
  wording,
  icons,
  epitaph,
  causeSentences,
  points,
  tends,
  thresholds,
  formatDate,
  onClose,
  onResurrect,
  resurrectDisabled = false,
  resurrectDisabledReason,
}: AutopsyDialogProps) {
  const text = wording.autopsy;
  const ref = useRef<HTMLDialogElement>(null);
  const ids = { title: useId(), chart: useId(), cause: useId(), reason: useId() };

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    // Environments without showModal (older jsdom) just get the open attribute.
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    // close() fires "close", not "cancel", so this never calls onClose.
    return () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
  }, []);

  const showEpitaph = epitaph !== undefined && epitaph.trim() !== "";
  const showReason = resurrectDisabled && resurrectDisabledReason !== undefined;

  return (
    <dialog
      ref={ref}
      className="shell-autopsy"
      data-state="dead"
      style={shellStyle(theme)}
      aria-labelledby={ids.title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={ids.title} className="shell-autopsy-title">
        <span className="shell-icon" aria-hidden="true">
          {icons.dead}
        </span>
        {text.title}
      </h2>

      {showEpitaph && (
        <div className="shell-autopsy-epitaph">
          <p className="shell-autopsy-label">{text.epitaph}</p>
          <blockquote className="shell-autopsy-epitaph-text">{epitaph}</blockquote>
        </div>
      )}

      {points.length > 0 && (
        <AutopsyChart
          points={points}
          tends={tends}
          thresholds={thresholds}
          formatDate={formatDate}
          text={text}
          titleId={ids.chart}
        />
      )}

      <section className="shell-autopsy-cause" aria-labelledby={ids.cause}>
        <h3 id={ids.cause} className="shell-autopsy-heading">
          {text.cause}
        </h3>
        {causeSentences.map((sentence, index) => (
          <p key={index} className="shell-autopsy-sentence">
            {sentence}
          </p>
        ))}
      </section>

      <div className="shell-autopsy-actions">
        {onResurrect !== undefined && (
          <>
            <button
              type="button"
              className="shell-button shell-button-primary"
              aria-disabled={resurrectDisabled ? true : undefined}
              aria-describedby={showReason ? ids.reason : undefined}
              title={showReason ? resurrectDisabledReason : undefined}
              onClick={resurrectDisabled ? undefined : onResurrect}
            >
              {wording.actions.resurrect}
            </button>
            {showReason && (
              <span id={ids.reason} hidden>
                {resurrectDisabledReason}
              </span>
            )}
          </>
        )}
        <button type="button" className="shell-button shell-button-quiet" onClick={onClose}>
          {text.close}
        </button>
      </div>
    </dialog>
  );
}
