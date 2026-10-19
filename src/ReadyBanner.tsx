import { useEffect } from "react";
import AmphionLogo from "./AmphionLogo";

/** iOS-style notification banner announcing a finished tab (US-06). Tapping it opens the song. */
export default function ReadyBanner({ title, onOpen, onDismiss }: { title: string; onOpen: () => void; onDismiss: () => void }) {
  // Restarts only for a new banner, not on every parent render.
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [title]);

  return (
    <button className="ready-banner" type="button" role="status" onClick={onOpen}>
      <span className="ready-banner-icon" aria-hidden="true"><AmphionLogo /></span>
      <span className="ready-banner-text">
        <strong>Amphion</strong>
        <span>Your tab for '{title}' is ready</span>
      </span>
      <span className="ready-banner-when">now</span>
    </button>
  );
}
