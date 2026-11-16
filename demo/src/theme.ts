import type { Theme } from "./LoginPage";

/** The device's current light/dark setting. */
export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
