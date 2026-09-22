import type { Emo, EmojiSkinTone } from "@desert-ant-labs/emo";
import { load, timed } from "../runtime";
import { card, debounce, el, pct } from "../ui";

export const emoCard = () => card("emo", (c) => {
  const input = el("input", { type: "text", placeholder: "What's on your list? e.g. pay my bills", autocomplete: "off" });
  const tone = el("select", {},
    ...(["default", "light", "mediumLight", "medium", "mediumDark", "dark"] as EmojiSkinTone[]).map((t) => el("option", { value: t, text: `skin tone: ${t}` })));
  const big = el("div", { class: "emoji-big", text: "✨" });
  const list = el("div", { class: "chips" });
  c.body.append(input, big, list, tone);

  const run = debounce(async () => {
    const text = input.value;
    if (!text.trim()) { big.textContent = "✨"; list.replaceChildren(); return; }
    try {
      const emo = await load<Emo>("emo");
      const s = await timed("emo", "suggestions", () => emo.suggestions(text, { limit: 5, skinTone: tone.value as EmojiSkinTone }));
      big.textContent = s[0]?.emoji ?? "🤷";
      list.replaceChildren(...s.map((x) => el("span", { class: "chip static", text: `${x.emoji} ${pct(x.confidence)}` })));
    } catch (e) { c.showError(e); }
  }, 200);
  input.oninput = run; tone.onchange = run;
});
