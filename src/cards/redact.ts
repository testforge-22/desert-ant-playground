import type { Redact, Redaction } from "@desert-ant-labs/redact";
import { load, timed } from "../runtime";
import { card, el } from "../ui";

const SAMPLE = "Email Anna Kovács at anna@example.hu or call +47 912 34 567. IBAN DE89370400440532013000. " +
  "Ship to 123 Main Street, Apt 4B, Oslo. VAT DE129273398, IMEI 490154203237518, IP 10.0.0.12.";

export const redactCard = () => card("redact", (c) => {
  const input = el("textarea", { rows: "4" }); input.value = SAMPLE;
  const conf = el("input", { type: "range", min: "0.1", max: "0.95", step: "0.05", value: "0.6" });
  const confLabel = el("span", { class: "muted small", text: "min confidence 0.60" });
  conf.oninput = () => (confLabel.textContent = `min confidence ${Number(conf.value).toFixed(2)}`);
  const btn = el("button", { text: "Redact" });
  const redacted = el("pre", { class: "mono wrap" });
  const table = el("table", { class: "items" });
  const restoreIn = el("textarea", { rows: "3", placeholder: "Edit the redacted text (as an LLM would), then restore" });
  const restoreBtn = el("button", { class: "ghost", text: "Restore originals" });
  const restored = el("pre", { class: "mono wrap" });
  const restoreBox = el("div", { class: "sub", hidden: true }, el("div", { class: "muted small", text: "Round trip: placeholders survive downstream processing" }), restoreIn, restoreBtn, restored);
  c.body.append(input, el("div", { class: "row" }, conf, confLabel), btn, redacted, table, restoreBox);

  let last: Redaction | null = null;
  btn.onclick = async () => {
    c.setBusy("Redacting…");
    try {
      const redact = await load<Redact>("redact");
      const r = await timed("redact", "redaction", () => redact.redaction(input.value, { minimumConfidence: Number(conf.value) }));
      last = r;
      redacted.textContent = r.redactedText;
      table.replaceChildren(
        el("tr", {}, el("th", { text: "placeholder" }), el("th", { text: "original" }), el("th", { text: "label" }), el("th", { text: "conf" })),
        ...r.items.map((it) => el("tr", {}, el("td", { text: it.placeholder }), el("td", { text: it.original }), el("td", { text: it.label }), el("td", { text: it.confidence.toFixed(2) }))));
      restoreIn.value = r.redactedText; restored.textContent = ""; restoreBox.hidden = false;
      c.setBusy(null);
    } catch (e) { c.showError(e); }
  };
  restoreBtn.onclick = () => { if (last) restored.textContent = last.restore(restoreIn.value); };
});
