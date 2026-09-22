import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { MODELS, allEntries, entry, load, dispose } from "./runtime";
import { tongueCard } from "./cards/tongue";
import { emoCard } from "./cards/emo";
import { redactCard } from "./cards/redact";
import { gistCard } from "./cards/gist";
import { shapesCard } from "./cards/shapes";
import { earCard } from "./cards/ear";
import { clearCard } from "./cards/clear";
import { inspector } from "./inspector";
import { el } from "./ui";

const app = document.getElementById("app")!;
const banner = el("div", { class: "banner", hidden: true });
app.append(
  el("header", {},
    el("h1", { text: "Desert Ant Playground" }),
    el("p", { class: "muted", text: "Seven on-device models running in this browser tab. Nothing you type, draw or record leaves the phone." })),
  banner,
  tongueCard(), emoCard(), redactCard(), gistCard(), shapesCard(), earCard(), clearCard(),
  inspector(),
  el("footer", { class: "muted small" },
    el("span", { text: "Models by " }), el("a", { href: "https://desertant.com", target: "_blank", rel: "noopener", text: "Desert Ant Labs" }),
    el("span", { text: " (source-available licence). SDK 3.1.0. " }),
    el("a", { href: "https://github.com/Desert-Ant-Labs/desert-ant-core", target: "_blank", rel: "noopener", text: "desert-ant-core" })),
);

// Update flow: the new service worker waits until the user agrees, so a model
// mid-inference is never yanked.
const updateSW = registerSW({
  onNeedRefresh() {
    const btn = el("button", { class: "small", text: "Reload" });
    btn.onclick = () => updateSW(true);
    banner.replaceChildren(el("span", { text: "A new version is available. " }), btn); banner.hidden = false;
  },
  onOfflineReady() {
    banner.replaceChildren(el("span", { text: "App shell cached. Fetch models in the Inspector to use them offline." })); banner.hidden = false;
    setTimeout(() => (banner.hidden = true), 6000);
  },
});

// Install prompt (Chrome): keep the event and offer a button.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  const btn = el("button", { class: "small", text: "Install app" });
  btn.onclick = () => { (e as any).prompt(); banner.hidden = true; };
  banner.replaceChildren(el("span", { text: "Add to home screen for offline use. " }), btn); banner.hidden = false;
});

// Debug hooks for driving the page from a console or a headless test.
(window as any).dal = { MODELS, load, dispose, entries: allEntries, entry };
