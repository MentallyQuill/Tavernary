export const COLOR_MODE_STORAGE_KEY = "tavernary:color-mode";
export const COLOR_MODE_ATTRIBUTE = "data-color-mode";
export type ColorMode = "standard" | "accessible";

export const COLOR_MODE_BOOTSTRAP = `(function(){var mode="standard";try{if(localStorage.getItem(${JSON.stringify(COLOR_MODE_STORAGE_KEY)})==="accessible")mode="accessible"}catch{}document.documentElement.setAttribute(${JSON.stringify(COLOR_MODE_ATTRIBUTE)},mode)})();`;

const changeEvent = "tavernary-color-mode-change";
let volatileMode: ColorMode = "standard";
let volatileOnly = false;

function normalizedMode(value: string | null): ColorMode {
  return value === "accessible" ? "accessible" : "standard";
}

export function getColorMode(): ColorMode {
  if (typeof window === "undefined") return "standard";
  if (volatileOnly) return volatileMode;
  try {
    return normalizedMode(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY));
  } catch {
    return volatileMode;
  }
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.setAttribute(COLOR_MODE_ATTRIBUTE, mode);
}

export function setColorMode(mode: ColorMode) {
  volatileMode = mode;
  applyColorMode(mode);
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    volatileOnly = false;
  } catch {
    // The switch still works for this visit when browser storage is unavailable.
    volatileOnly = true;
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeColorMode(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLOR_MODE_STORAGE_KEY && event.key !== null) return;
    volatileOnly = false;
    volatileMode = normalizedMode(event.newValue);
    applyColorMode(volatileMode);
    listener();
  };
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function serverColorMode(): ColorMode {
  return "standard";
}
