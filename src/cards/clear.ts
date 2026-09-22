import type { Clear, ClearResult, LoudnessPreset } from "@desert-ant-labs/clear";
import { load, timed } from "../runtime";
import { type Recording, record, play, stopPlayback, toWav, rms } from "../audio";
import { card, el, fmtMs } from "../ui";

export const clearCard = () => card("clear", (c) => {
  const recBtn = el("button", { text: "Record (up to 15 s)" });
  const status = el("div", { class: "muted small", text: "Record in a noisy spot, then compare. Tap again to stop early." });
  const strength = el("input", { type: "range", min: "0", max: "1", step: "0.05", value: "1" });
  const strengthLabel = el("span", { class: "muted small", text: "strength 1.00" });
  strength.oninput = () => (strengthLabel.textContent = `strength ${Number(strength.value).toFixed(2)}`);
  const preset = el("select", {}, ...(["podcast", "spotify", "youtube", "broadcast"] as LoudnessPreset[]).map((p) => el("option", { value: p, text: `target: ${p}` })), el("option", { value: "none", text: "target: none (bypass mastering)" }));
  const enhanceBtn = el("button", { text: "Enhance", disabled: true });
  const playOrig = el("button", { class: "ghost", text: "Play original", disabled: true });
  const playEnh = el("button", { class: "ghost", text: "Play enhanced", disabled: true });
  const stopBtn = el("button", { class: "ghost", text: "Stop" });
  const dl = el("a", { class: "button ghost", text: "Download WAV", hidden: true, download: "clear-enhanced.wav" });
  const result = el("div", { class: "kv" });
  c.body.append(recBtn, status, el("div", { class: "row" }, strength, strengthLabel), preset, enhanceBtn,
    el("div", { class: "row" }, playOrig, playEnh, stopBtn, dl), result);

  let rec: Recording | null = null; let enhanced: ClearResult | null = null; let active: { stop(): void } | null = null;

  recBtn.onclick = async () => {
    if (active) { active.stop(); return; }
    try {
      const r = await record(15, (t) => (status.textContent = `Recording… ${t.toFixed(1)} s (tap to stop)`));
      active = r; recBtn.textContent = "Stop";
      load("clear").catch(() => {});
      rec = await r.done; active = null; recBtn.textContent = "Record (up to 15 s)";
      status.textContent = `Captured ${rec.durationSec.toFixed(1)} s at ${rec.sampleRate} Hz, level ${(20 * Math.log10(rms(rec.samples) + 1e-9)).toFixed(0)} dBFS.`;
      enhanceBtn.disabled = false; playOrig.disabled = false; playEnh.disabled = true; dl.hidden = true; enhanced = null; result.replaceChildren();
    } catch (e) { active = null; recBtn.textContent = "Record (up to 15 s)"; c.showError(e); }
  };

  enhanceBtn.onclick = async () => {
    if (!rec) return;
    c.setBusy("Enhancing…"); enhanceBtn.disabled = true;
    try {
      const clear = await load<Clear>("clear");
      const target = preset.value === "none" ? null : (preset.value as LoudnessPreset);
      const r = await timed("clear", "enhance", () => clear.enhance(rec!.samples, rec!.sampleRate, { strength: Number(strength.value), targetLUFS: target }));
      enhanced = r; playEnh.disabled = false;
      dl.href = URL.createObjectURL(toWav(r.samples, r.sampleRate)); dl.hidden = false;
      const kv: [string, string][] = [
        ["audio", `${r.durationSec.toFixed(2)} s`],
        ["processing", `${fmtMs(r.processingSec * 1000)} (${r.realtimeFactor.toFixed(1)}× real time)`],
        ["output", `${r.sampleRate} Hz, ${r.channelCount} channel`],
        ["input loudness", r.measuredLUFS == null ? "n/a (bypassed)" : `${r.measuredLUFS.toFixed(1)} LUFS`],
        ["output true peak", r.measuredTruePeakDBFS == null ? "n/a" : `${r.measuredTruePeakDBFS.toFixed(1)} dBTP`],
      ];
      result.replaceChildren(...kv.map(([k, v]) => el("div", {}, el("span", { class: "muted", text: k }), el("span", { text: v }))));
      c.setBusy(null);
    } catch (e) { c.showError(e); }
    finally { enhanceBtn.disabled = false; }
  };
  playOrig.onclick = () => rec && play(rec.samples, rec.sampleRate);
  playEnh.onclick = () => enhanced && play(enhanced.samples, enhanced.sampleRate);
  stopBtn.onclick = stopPlayback;
});
