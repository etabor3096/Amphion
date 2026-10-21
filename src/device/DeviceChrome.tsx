import { useEffect, useState } from "react";
import type { Theme } from "../LoginPage";

/**
 * Simulated iOS status bar and home indicator, drawn only inside the demo phone frame.
 * Their heights match the `--safe-top` / `--safe-bottom` values set for [data-device="iphone"].
 */
export default function DeviceChrome({ theme }: { theme: Theme }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className={`device-status-bar ${scrolled ? "scrolled" : ""}`} data-theme={theme} aria-hidden="true">
        <span className="device-time">9:41</span>
        <span className="device-island" />
        <span className="device-indicators">
          <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
          <svg viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5ZM3.3 6.7l-1.5-1.5a8.8 8.8 0 0 1 12.4 0l-1.5 1.5a6.7 6.7 0 0 0-9.4 0Z" /></svg>
          <svg viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" /><rect x="2.5" y="2.5" width="17" height="8" rx="2" /><path d="M25 4.5v4a2 2 0 0 0 0-4Z" opacity="0.4" /></svg>
        </span>
      </div>
      <div className="device-home-indicator" data-theme={theme} aria-hidden="true" />
    </>
  );
}
