import { useId, type ReactNode } from "react";
import type { Item } from "@decay-engine/engine";
import type { ItemState, StateIcons, ThemeProps, WordingProps } from "../types";
import { shellStyle } from "../theme";
import "../shell.css";

export interface ItemCardProps<Payload, PolicyData> {
  item: Item<Payload, PolicyData>;
  /** The item's state at the time being shown. */
  state: ItemState;
  theme: ThemeProps;
  wording: WordingProps;
  icons: StateIcons;
  /** The item's main text (the shell knows nothing about the payload). Cut to two lines. */
  renderText: (item: Item<Payload, PolicyData>) => ReactNode;
  /** Optional line under the text, for example when the item next needs tending. */
  renderDetail?: (item: Item<Payload, PolicyData>) => ReactNode;
  /** Tend (alive or weak) or resurrect (dead). No button when omitted. */
  onAction?: () => void;
  /** Edit the item. No button when omitted. The app opens its own form. */
  onEdit?: () => void;
  /** Remove the item. No button when omitted. The app asks for confirmation. */
  onRemove?: () => void;
}

/**
 * One item in a list. The state is shown by its icon and its words from the
 * wording, never by colour alone. The action button says wording.actions.tend
 * for alive and weak items and wording.actions.resurrect for dead ones.
 * Buttons appear in this order: action, edit, remove.
 */
export function ItemCard<Payload, PolicyData>({
  item,
  state,
  theme,
  wording,
  icons,
  renderText,
  renderDetail,
  onAction,
  onEdit,
  onRemove,
}: ItemCardProps<Payload, PolicyData>) {
  const textId = useId();
  const actionLabel = state === "dead" ? wording.actions.resurrect : wording.actions.tend;
  const detail = renderDetail?.(item);
  const hasActions = onAction !== undefined || onEdit !== undefined || onRemove !== undefined;

  return (
    <article
      className="shell-item-card"
      data-state={state}
      style={shellStyle(theme)}
      aria-labelledby={textId}
    >
      <p className="shell-state">
        <span className="shell-icon" aria-hidden="true">
          {icons[state]}
        </span>
        <span className="shell-state-label">{wording.states[state]}</span>
      </p>
      <p id={textId} className="shell-item-text">
        {renderText(item)}
      </p>
      {detail !== undefined && detail !== null && detail !== false && (
        <div className="shell-item-detail">{detail}</div>
      )}
      {hasActions && (
        <div className="shell-item-actions">
          {onAction !== undefined && (
            <button
              type="button"
              className="shell-button shell-button-primary"
              aria-describedby={textId}
              onClick={onAction}
            >
              {actionLabel}
            </button>
          )}
          {onEdit !== undefined && (
            <button
              type="button"
              className="shell-button shell-button-quiet"
              aria-describedby={textId}
              onClick={onEdit}
            >
              {wording.actions.edit}
            </button>
          )}
          {onRemove !== undefined && (
            <button
              type="button"
              className="shell-button shell-button-quiet"
              aria-describedby={textId}
              onClick={onRemove}
            >
              {wording.actions.remove}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
