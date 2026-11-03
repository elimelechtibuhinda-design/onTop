// "Sync between devices" card (Me tab) and the join dialog (also opened from a #sync= link).
import qrcode from "qrcode-generator";
import { on } from "../lib/bus.js";
import { esc } from "../lib/utils.js";
import { S } from "../lib/store.js";
import { syncInfo, turnOn, join, turnOff, deleteCloudCopy, syncNow, shareLink } from "../lib/sync.js";
import { openDialog, confirmDialog, toast } from "./ui.js";

function ago(ms) {
  if (!ms) return "never";
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 10 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(ms).toLocaleString();
}
function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function renderSyncCard(box) {
  const draw = () => {
    if (!box.isConnected) return off();
    const s = syncInfo();
    box.innerHTML = s.on ? `
      <div class="card-head"><h3>🔄 Sync between devices</h3><span class="pill ${s.error ? "warn" : "ok"}">${s.busy ? "Syncing…" : s.error ? "Needs attention" : "On"}</span></div>
      <p class="small">${s.error ? esc(s.error) : `Last synced ${ago(s.lastSyncAt)}.`} Changes sync automatically.</p>
      <div class="sync-code" style="margin-top:10px">
        <div class="qr" aria-label="QR code to join sync">${qrSvg(shareLink(s.code))}</div>
        <div class="stack tight">
          <span class="label">Your sync code</span>
          <code class="mono big-code">${esc(s.code)}</code>
          <p class="tiny muted">On your other device, scan this QR code, or open Dialed In → Me → Sync → “I have a code”. <b>Keep the code private</b> — anyone with it can see your data. Screenshot it somewhere safe; it can't be recovered.</p>
          <div class="row wrap"><button class="btn sm" data-copy>Copy code</button><button class="btn sm" data-now>Sync now</button></div>
        </div>
      </div>
      <details class="small" style="margin-top:10px"><summary>Turn off</summary>
        <div class="row wrap" style="margin-top:8px">
          <button class="btn sm" data-off>Stop syncing this device</button>
          <button class="btn sm danger" data-delete>Delete the cloud copy (all devices)</button>
        </div>
        <p class="tiny muted" style="margin-top:6px">Either way, the data on your devices stays.</p>
      </details>`
      : `
      <div class="card-head"><h3>🔄 Sync between devices</h3><span class="pill">Off</span></div>
      ${s.error ? `<p class="small" style="color:var(--warn)">${esc(s.error)}</p>` : ""}
      <p class="small">Use Dialed In on your phone <i>and</i> laptop. Your data is <b>encrypted on this device</b> before it's sent — nobody else, including us, can read it. No account needed.</p>
      <div class="row wrap" style="margin-top:10px">
        <button class="btn primary" data-on>Turn on sync</button>
        <button class="btn" data-join>I have a code</button>
      </div>`;
    const q = (sel) => box.querySelector(sel);
    q("[data-on]")?.addEventListener("click", async (e) => {
      e.target.disabled = true; e.target.textContent = "Setting up…";
      await turnOn();
      if (syncInfo().error) toast("Sync is on, but couldn't reach the server yet — it'll keep trying.");
      else toast("Sync is on ✓ Now add your other device.");
    });
    q("[data-join]")?.addEventListener("click", () => openJoinDialog());
    q("[data-copy]")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(s.code); toast("Code copied"); } catch { toast(s.code); }
    });
    q("[data-now]")?.addEventListener("click", () => syncNow());
    q("[data-off]")?.addEventListener("click", async () => {
      if (await confirmDialog("This device stops syncing. Your data stays on it, and your other devices keep syncing with each other.", { okText: "Stop syncing", title: "Stop syncing this device?" })) { turnOff(); toast("Sync off on this device."); }
    });
    q("[data-delete]")?.addEventListener("click", async () => {
      if (!(await confirmDialog("This deletes the encrypted copy from the cloud and turns sync off on every device. Each device keeps its own data.", { okText: "Delete cloud copy", danger: true, title: "Delete cloud copy?" }))) return;
      try { await deleteCloudCopy(); toast("Cloud copy deleted. Sync is off."); } catch { toast("Couldn't reach the server — try again when you're online."); }
    });
  };
  const off = on("sync", draw);
  draw();
}

export function openJoinDialog(prefill = "", onJoined = null) {
  const st = S();
  const mine = st.sessions.length;
  openDialog(`
    <h2>Join your sync</h2>
    <p class="small muted">Enter the code from your other device (Me → Sync between devices).</p>
    <input type="text" data-code value="${esc(prefill)}" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" style="font-family:ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase">
    ${mine ? `<p class="small">This device already has <b>${mine} session${mine > 1 ? "s" : ""}</b>. They'll be <b>combined</b> with your other device — nothing is deleted.</p>` : ""}
    <p class="small" data-err style="color:var(--danger)"></p>
    <div class="dlg-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>Join</button></div>`, (dlg, close) => {
    const go = dlg.querySelector("[data-go]");
    const err = dlg.querySelector("[data-err]");
    const submit = async () => {
      go.disabled = true; go.textContent = "Joining…"; err.textContent = "";
      try {
        const r = await join(dlg.querySelector("[data-code]").value);
        if (r === "invalid") err.textContent = "That doesn't look like a sync code (16 letters/numbers).";
        else if (r === "notfound") err.textContent = "No sync found with that code. Check it and try again.";
        else if (r === "error") err.textContent = syncInfo().error || "Couldn't finish syncing — try again.";
        else {
          close();
          toast("Synced ✓ This device is now connected.");
          if (onJoined) onJoined();
          return;
        }
      } catch { err.textContent = "Couldn't reach the server. Check your connection and try again."; }
      go.disabled = false; go.textContent = "Join";
    };
    go.addEventListener("click", submit);
    dlg.querySelector("[data-code]").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  });
}
