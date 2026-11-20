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

/** One app-defined marker on the chart, for example a kind of contact. */
export interface AutopsyMarker {
  /** Time in ms. */
  at: number;
  /** The app's own key; also the data-marker attribute. */
  kind: string;
  /** Legend words for this kind, for example "Call". */
  label: string;
}

/** One legend kind and how many of its markers fall inside the chart's span. */
type MarkerCount = { kind: string; label: string; count: number };

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
  /**
   * App-defined markers. When given (even empty), they replace `tends`: the
   * right/wrong marks and their two legend entries are not drawn. The legend
   * shows each kind that has a marker inside the chart's span once, in order
   * of first appearance, with that marker's label. Omitted: today's
   * right/wrong marks.
   */
  markers?: readonly AutopsyMarker[];
  /**
   * Draws one marker's shape, centred on 0,0, about 10 units wide, in the
   * chart row and in the legend. Omitted: a filled circle for every kind.
   */
  renderMarker?: (kind: string) => ReactNode;
  /**
   * The markers summed up in words, for example "3 calls, 2 messages".
   * It receives one entry per legend kind, in legend order, counting only
   * the markers inside the chart's span.
   */
  markerSummary?: (counts: readonly MarkerCount[]) => string;
  /**
   * Move focus to the dialog's content (its title) when it opens, instead of
   * the browser's default (the first button). The title gets tabindex="-1".
   * Omitted or false: exactly as today (no tabindex on the title, focus left to showModal).
   */
  focusContentOnOpen?: boolean;
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

/** The marker shape used when the app gives no renderMarker: a filled circle in the text colour. */
function DefaultMarker() {
  return <circle r={5} className="shell-autopsy-marker-default" fill="currentColor" />;
}

/** Each distinct kind once, in order of first appearance, with that marker's label. */
function legendKinds(markers: readonly AutopsyMarker[]): { kind: string; label: string }[] {
  const kinds: { kind: string; label: string }[] = [];
  for (const marker of markers) {
    if (!kinds.some((k) => k.kind === marker.kind)) kinds.push({ kind: marker.kind, label: marker.label });
  }
  return kinds;
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
  markers?: readonly AutopsyMarker[];
  renderMarker?: (kind: string) => ReactNode;
  markerSummary?: (counts: readonly MarkerCount[]) => string;
  thresholds: { weak: number; dead: number };
  formatDate: (ms: number) => string;
  text: AutopsyWording;
  titleId: string;
}

function AutopsyChart({
  points,
  tends,
  markers,
  renderMarker,
  markerSummary,
  thresholds,
  formatDate,
  text,
  titleId,
}: ChartProps) {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const from = first.at;
  const to = last.at;
  const span = Math.max(1, to - from);
  const x = (at: number) => round2(PLOT.left + ((at - from) / span) * PLOT.width);
  const y = (health: number) => round2(PLOT.top + (1 - clampHealth(health) / 100) * PLOT.height);
  const inSpan = (at: number) => at >= from && at <= to;
  const drawMarker = (kind: string) => (renderMarker === undefined ? <DefaultMarker /> : renderMarker(kind));

  const shown = markers === undefined ? tends.filter((t) => inSpan(t.at)) : [];
  const shownMarkers = markers === undefined ? [] : markers.filter((m) => inSpan(m.at));
  // Only kinds with at least one marker inside the span get a legend entry (Req 28.3).
  const kinds = legendKinds(shownMarkers);
  const right = shown.filter((t) => t.correct).length;
  const base = {
    from: formatDate(from),
    to: formatDate(to),
    startHealth: first.health,
    endHealth: last.health,
  };
  const label =
    markers === undefined
      ? text.chartLabel({ ...base, right, wrong: shown.length - right })
      : text.chartLabel({
          ...base,
          right: 0,
          wrong: 0,
          markers: markerSummary?.(
            kinds.map((k) => ({ ...k, count: shownMarkers.filter((m) => m.kind === k.kind).length }))
          ),
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
        {shownMarkers.map((m, index) => (
          <g key={index} data-marker={m.kind} transform={`translate(${x(m.at)},${MARK_Y})`}>
            <line className="shell-autopsy-guide" x1={0} y1={-6} x2={0} y2={PLOT.top - MARK_Y} />
            {drawMarker(m.kind)}
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
        {markers === undefined ? (
          <>
            <li data-legend="right">
              {legendShape(<RightMark />)}
              {text.markRight}
            </li>
            <li data-legend="wrong">
              {legendShape(<WrongMark />)}
              {text.markWrong}
            </li>
          </>
        ) : (
          kinds.map((k) => (
            <li key={k.kind} data-legend-marker={k.kind}>
              {legendShape(drawMarker(k.kind))}
              {k.label}
            </li>
          ))
        )}
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
 *
 * With `markers`, the app's own markers (shape from renderMarker, label
 * from the marker) replace the right/wrong marks and their legend entries,
 * and the summary gets markerSummary's text. With `focusContentOnOpen`, the
 * title takes focus when the dialog opens.
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
  markers,
  renderMarker,
  markerSummary,
  focusContentOnOpen = false,
}: AutopsyDialogProps) {
  const text = wording.autopsy;
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const ids = { title: useId(), chart: useId(), cause: useId(), reason: useId() };

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    // Environments without showModal (older jsdom) just get the open attribute.
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    // Runs once on mount, after showModal has placed focus (Req 28.5).
    if (focusContentOnOpen) titleRef.current?.focus();
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
      <h2
        ref={titleRef}
        id={ids.title}
        className="shell-autopsy-title"
        tabIndex={focusContentOnOpen ? -1 : undefined}
      >
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
          markers={markers}
          renderMarker={renderMarker}
          markerSummary={markerSummary}
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
