export const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbwddUxaGzboariMuxNFCQqfLXcL3XvM40NLT-cDcTd8cvcdCkcccY5BjZt7Yd-DzvWrnw/exec";
export const AUTO_REFRESH_MS = 30000;

export function getApiUrl() {
  return localStorage.getItem("YK_PULSE_API_URL") || DEFAULT_API_URL;
}

export function saveApiUrl(url) {
  localStorage.setItem("YK_PULSE_API_URL", url);
}

export function resetApiUrl() {
  localStorage.removeItem("YK_PULSE_API_URL");
}

export function getViewMode() {
  return localStorage.getItem("YK_PULSE_VIEW_MODE") || "auto";
}

export function saveViewMode(mode) {
  localStorage.setItem("YK_PULSE_VIEW_MODE", mode || "auto");
  applyViewMode(mode || "auto");
}

export function applyViewMode(mode = getViewMode()) {
  const root = document.documentElement;
  root.classList.remove("force-mobile", "force-pc");
  if (mode === "mobile") root.classList.add("force-mobile");
  if (mode === "pc") root.classList.add("force-pc");
}

export function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const script = document.createElement("script");

    window[cb] = (data) => {
      delete window[cb];
      script.remove();
      resolve(data);
    };

    script.onerror = () => {
      delete window[cb];
      script.remove();
      reject(new Error("API 연결 실패"));
    };

    const query = new URLSearchParams({
      action,
      callback: cb,
      t: String(Date.now()),
      ...params,
    }).toString();

    script.src = `${getApiUrl()}?${query}`;
    document.body.appendChild(script);
  });
}

export const num = (v) =>
  Number(String(v ?? "0").replace(/,/g, "").replace("%", "").trim()) || 0;

export const fmt = (v, fallback = "-") => {
  if (v === undefined || v === null || v === "") return fallback;
  return v;
};

export function displayProd(v) {
  const n = num(v);
  if (!n) return "0";
  return String(Math.round(n * 10) / 10).replace(/\.0$/, "");
}

export function pct(v) {
  return ((Number(v) || 0) * 100).toFixed(1) + "%";
}

export function addMinutesToTime(baseDate, minutes) {
  const d = new Date(baseDate.getTime() + (Number(minutes) || 0) * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function minutesToHHMM(min) {
  let m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
