/**
 * How this page should present the app:
 * - "frame-host": a desktop browser. Draw an iPhone and load the app inside it (an iframe).
 * - "inside-frame": we are the app running inside that iPhone frame.
 * - "full-screen": a phone or narrow window, or `?frame=0`. Show the app edge to edge.
 *
 * The app runs in an iframe (not a resized div) so its `position: fixed` bars, `100dvh`
 * layouts, window scrolling and phone-width media queries behave exactly as on a phone.
 */
export type DeviceMode = "frame-host" | "inside-frame" | "full-screen";

export function getDeviceMode(): DeviceMode {
  const params = new URLSearchParams(window.location.search);
  if (params.get("device") === "iphone") return "inside-frame";
  if (params.get("frame") === "0" || window.self !== window.top) return "full-screen";
  return window.matchMedia("(min-width: 600px)").matches ? "frame-host" : "full-screen";
}

export function isInsideDeviceFrame() {
  return document.documentElement.dataset.device === "iphone";
}
