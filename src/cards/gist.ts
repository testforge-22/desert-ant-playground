import type { Gist } from "@desert-ant-labs/gist";
import { load, timed } from "../runtime";
import { bar, card, el, pct } from "../ui";

const SAMPLE = "How to start a podcast with just your phone: picking a mic, recording in a quiet room, editing, and publishing to Spotify.";

export const gistCard = () => card("gist", (c) => {
  const input = el("textarea", { rows: "4" }); input.value = SAMPLE;
  const btn = el("button", { text: "Classify" });
  const top = el("div", { class: "bars" });
  const toggle = el("button", { class: "ghost small", text: "Show all 36 scores", hidden: true });
  const all = el("div", { class: "bars small", hidden: true });
  c.body.append(input, btn, top, toggle, all);

  btn.onclick = async () => {
    c.setBusy("Tagging…");
    try {
      const gist = await load<Gist>("gist");
      const topics = await timed("gist", "classify", () => gist.classify(input.value, { topK: 5 }));
      const scores = await timed("gist", "scores", () => gist.scores(input.value));
      top.replaceChildren(...topics.map((t) => bar(t.score, t.name, pct(t.score))));
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      all.replaceChildren(...sorted.map(([slug, s]) => bar(s, slug, pct(s))));
      toggle.hidden = false;
      c.setBusy(null);
    } catch (e) { c.showError(e); }
  };
  toggle.onclick = () => { all.hidden = !all.hidden; toggle.textContent = all.hidden ? "Show all 36 scores" : "Hide scores"; };
});
