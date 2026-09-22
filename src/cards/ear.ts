import type { Ear } from "@desert-ant-labs/ear";
import { entry, load, timed } from "../runtime";
import { type Recording, record, play, rms } from "../audio";
import { bar, card, el, fmtMs, languageName, pct } from "../ui";

export const earCard = () => card("ear", (c) => {
  const recBtn = el("button", { text: "Record (up to 10 s)" });
  const playBtn = el("button", { class: "ghost", text: "Play", disabled: true });
  const status = el("div", { class: "muted small", text: "Speak a few sentences in one language. Tap again to stop early." });
  const headline = el("div", { class: "headline" });
  const sub = el("div", { class: "muted" });
  const cands = el("div", { class: "bars" });
  c.body.append(el("div", { class: "row" }, recBtn, playBtn), status, headline, sub, cands);

  let rec: Recording | null = null;
  let active: { stop(): void } | null = null;

  recBtn.onclick = async () => {
    if (active) { active.stop(); return; }
    try {
      c.out.textContent = ""; headline.textContent = ""; sub.textContent = ""; cands.replaceChildren();
      const r = await record(10, (t) => (status.textContent = `Recording… ${t.toFixed(1)} s (tap to stop)`));
      active = r; recBtn.textContent = "Stop";
      // Load in parallel with recording so the phone is not idle.
      const earP = load<Ear>("ear");
      rec = await r.done; active = null; recBtn.textContent = "Record (up to 10 s)"; playBtn.disabled = false;
      status.textContent = `Captured ${rec.durationSec.toFixed(1)} s at ${rec.sampleRate} Hz, level ${(20 * Math.log10(rms(rec.samples) + 1e-9)).toFixed(0)} dBFS. Identifying…`;
      const ear = await earP;
      const d = await timed("ear", "identify", () => ear.identify(rec!.samples, rec!.sampleRate));
      status.textContent = `Listened to ${d.windows} window${d.windows === 1 ? "" : "s"}; identify took ${fmtMs(entry("ear").timings.at(-1)?.ms ?? 0)}.`;
      headline.textContent = d.language ? languageName(d.language) : "nothing heard";
      sub.replaceChildren(
        el("span", { class: `pill ${d.isReliable ? "ready" : "error"}`, text: d.isReliable ? "reliable" : "not reliable" }),
        el("span", { text: d.isReliable ? " safe to route on" : " top candidates too close, or a Nordic language (flagged by design)" }));
      cands.replaceChildren(...d.candidates.slice(0, 5).map((p) => bar(p.probability, `${p.language} ${languageName(p.language)}`, pct(p.probability))));
    } catch (e) { active = null; recBtn.textContent = "Record (up to 10 s)"; c.showError(e); }
  };
  playBtn.onclick = () => rec && play(rec.samples, rec.sampleRate);

});
