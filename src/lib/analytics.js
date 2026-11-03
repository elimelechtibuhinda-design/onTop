// Anonymous usage counts via GoatCounter (https://www.goatcounter.com): no cookies, no personal data,
// no third-party script — just a tiny "count this" request. Never sends anything the student typed.
// Off unless VITE_GOATCOUNTER_CODE is set at build time; students can opt out in Me; Do Not Track is respected.
import { S } from "./store.js";

const CODE = import.meta.env.VITE_GOATCOUNTER_CODE;

export const analyticsAvailable = () => !!CODE;

function allowed() {
  if (!CODE || import.meta.env.DEV) return false;
  if (S().profile.analyticsOff) return false;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return false;
  return true;
}

function send(path, title, isEvent) {
  if (!allowed()) return;
  const q = new URLSearchParams({
    p: path, t: title,
    s: `${screen.width},${screen.height},${devicePixelRatio || 1}`,
    rnd: Math.random().toString(36).slice(2),
  });
  if (isEvent) q.set("e", "true");
  try {
    fetch(`https://${CODE}.goatcounter.com/count?${q}`, { mode: "no-cors", keepalive: true, credentials: "omit" }).catch(() => {});
  } catch { /* offline or blocked — fine */ }
}

// One count per app open. Installed-app opens are counted separately so installs can be tracked.
export function countOpen() {
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  send(installed ? "/app-installed" : "/app", installed ? "Dialed In (installed app)" : "Dialed In");
}

// Named milestones only — never any user content.
export function countEvent(name) {
  send(name, name, true);
}
