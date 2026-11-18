import type { ThemeProps, WordingProps } from "../types";
import { shellStyle } from "../theme";
import "../shell.css";

export interface PreviewBannerProps {
  theme: ThemeProps;
  wording: WordingProps;
  /** Returns to today (the app sets its preview offset to 0). */
  onBackToToday: () => void;
}

/**
 * The banner shown while the app previews the future: wording.preview.banner
 * and a wording.preview.backToToday button. The app renders it only while
 * previewing. role="status" so its appearance is announced.
 */
export function PreviewBanner({ theme, wording, onBackToToday }: PreviewBannerProps) {
  return (
    <div className="shell-preview-banner" role="status" style={shellStyle(theme)}>
      <p className="shell-preview-banner-text">{wording.preview.banner}</p>
      <button type="button" className="shell-button" onClick={onBackToToday}>
        {wording.preview.backToToday}
      </button>
    </div>
  );
}
