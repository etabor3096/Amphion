export const DEMO_PREFIX = "amphion-demo:";
export const STORAGE_PREFIX = `${DEMO_PREFIX}v1:`;
const RESET_FLAG = "amphion-demo-reset";
const ACCOUNT_DELETED_FLAG = "amphion-demo-account-deleted";
// Under the demo prefix, so Reset demo data clears it and the seeded songs come back.
const ACCOUNT_DELETED_KEY = `${STORAGE_PREFIX}accountDeleted`;

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

/** Like requestDemoReset, but the next load starts with an empty library instead of the seeded songs. */
export function requestAccountDeletion() {
  window.sessionStorage.setItem(ACCOUNT_DELETED_FLAG, "1");
  requestDemoReset();
}

/** True after the account was deleted (US-15/RC-15): the library starts empty until Reset demo data. */
export function isAccountDeleted() {
  try {
    return window.localStorage.getItem(ACCOUNT_DELETED_KEY) !== null;
  } catch {
    return false;
  }
}

/** True on the first load after the account was deleted, so the sign-in screen can say so. */
export let accountJustDeleted = false;

// A reset reloads the page, and the old page's pending debounced writes (the store's or the hook's) can
// flush on pagehide after the keys were removed. So the next load clears them again before anything reads
// them. Both readers import this module first, so whichever loads first runs this check.
try {
  if (window.sessionStorage.getItem(RESET_FLAG)) {
    window.sessionStorage.removeItem(RESET_FLAG);
    clearDemoKeys();
  }
  if (window.sessionStorage.getItem(ACCOUNT_DELETED_FLAG)) {
    window.sessionStorage.removeItem(ACCOUNT_DELETED_FLAG);
    window.localStorage.setItem(ACCOUNT_DELETED_KEY, "true");
    accountJustDeleted = true;
  }
} catch {
  // Storage unavailable: nothing was saved, so there is nothing to clear.
}
