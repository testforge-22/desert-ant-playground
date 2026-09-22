import type { Tongue, Detection } from "@desert-ant-labs/tongue";
import { load, timed } from "../runtime";
import { bar, card, el, languageName, pct } from "../ui";

const SAMPLES: [string, string][] = [
  ["je voudrais un café au lait", "French"],
  ["kann ich das haben", "German"],
  ["jeg skal ha en kaffe, takk", "Norwegian (Nordic languages are close)"],
  ["안녕하세요 만나서 반갑습니다", "script alone decides"],
  ["la casa", "a genuine tie"],
  ["hi i am", "too short to be sure"],
];

export const tongueCard = () => card("tongue", (c) => {
  const input = el("input", { type: "text", placeholder: "Type in any language", autocomplete: "off", autocapitalize: "off" });
  const headline = el("div", { class: "headline", text: "…" });
  const sub = el("div", { class: "muted" });
  const cands = el("div", { class: "bars" });
  const tries = el("div", { class: "chips" }, ...SAMPLES.map(([t, note]) => {
    const b = el("button", { class: "chip", text: t, title: note });
    b.onclick = () => { input.value = t; run(t); };
    return b;
  }));
  c.body.append(input, headline, sub, cands, el("div", { class: "muted small", text: "Try:" }), tries);

  async function run(text: string) {
    if (!text.trim()) { headline.textContent = "…"; sub.textContent = ""; cands.replaceChildren(); return; }
    try {
      const tongue = await load<Tongue>("tongue");
      const d: Detection = await timed("tongue", "detect", () => tongue.detect(text));
      const first = d.candidates[0];
      headline.textContent = !first ? "…"
        : d.isTooCloseToCall && d.candidates[1] ? `${languageName(first.language)} or ${languageName(d.candidates[1].language)}`
        : languageName(first.language);
      sub.textContent = d.reliability === "empty" ? "" : `${d.reliability} · script ${d.route.verdict}`;
      cands.replaceChildren(...d.candidates.slice(0, 5).map((p) => bar(p.probability, `${p.language} ${languageName(p.language)}`, pct(p.probability))));
    } catch (e) { c.showError(e); }
  }
  // Tongue is a few thousand multiply-adds: no debounce needed.
  input.oninput = () => run(input.value);
});
