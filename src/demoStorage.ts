export const DEMO_PREFIX = "amphion-demo:";
export const STORAGE_PREFIX = `${DEMO_PREFIX}v1:`;
const RESET_FLAG = "amphion-demo-reset";

export function clearDemoKeys() {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const name = window.localStorage.key(i);
    if (name?.startsWith(DEMO_PREFIX)) keys.push(name);
  }
  keys.forEach((name) => window.localStorage.removeItem(name));
}

/** Throws if storage is unavailable. The caller reloads the page afterwards. */
export function requestDemoReset() {
  window.sessionStorage.setItem(RESET_FLAG, "1");
  clearDemoKeys();
}

// A reset reloads the page, and the old page's pending debounced writes (the store's or the hook's) can
// flush on pagehide after the keys were removed. So the next load clears them again before anything reads
// them. Both readers import this module first, so whichever loads first runs this check.
try {
  if (window.sessionStorage.getItem(RESET_FLAG)) {
    window.sessionStorage.removeItem(RESET_FLAG);
    clearDemoKeys();
  }
} catch {
  // Storage unavailable: nothing was saved, so there is nothing to clear.
}
