import { t } from "./i18n.js";
import { readStorage, writeStorage } from "./match-client.js";

const storageKey = "songen3_keyboard";
const actions = {
  jumpPressed: { text: "m068", code: "ArrowUp", label: "↑" },
  crouch: { text: "m069", code: "ArrowDown", label: "↓" },
  left: { text: "left", code: "ArrowLeft", label: "←" },
  right: { text: "right", code: "ArrowRight", label: "→" },
  attackPressed: { text: "keyAttack", code: "KeyW", label: "W" },
  guardPressed: { text: "keyGuard", code: "KeyD", label: "D" },
};
const directions = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };

function loadBindings() {
  try {
    const saved = JSON.parse(readStorage(storageKey));
    const bindings = Object.fromEntries(Object.keys(actions).map(action => [action, saved?.[action]]));
    const values = Object.values(bindings);
    if (values.every(key => typeof key?.code === "string" && key.code && typeof key.label === "string" && key.label) &&
        new Set(values.map(key => key.code)).size === values.length) return bindings;
  } catch { /* An invalid saved value uses the defaults. */ }
  return Object.fromEntries(Object.entries(actions).map(([action, { code, label }]) => [action, { code, label }]));
}

function isDesktop() {
  return !navigator.userAgentData?.mobile && !/iPhone|iPad|iPod|Android|Mobile|Tablet|Silk/i.test(navigator.userAgent) &&
    !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function createKeyboardSettings() {
  const bindings = loadBindings();
  const controlFor = code => Object.keys(bindings).find(action => bindings[action].code === code);
  if (!isDesktop()) return { controlFor };

  const open = document.querySelector("#open-keyboard-settings");
  const dialog = document.querySelector("#keyboard-dialog");
  const list = document.querySelector("#keyboard-actions");
  const waiting = document.querySelector("#keyboard-waiting");
  let selected = null;

  function updateSelection() {
    for (const row of list.children) row.setAttribute("aria-pressed", String(row.dataset.binding === selected));
    waiting.hidden = selected === null;
  }

  for (const [action, { text }] of Object.entries(actions)) {
    const row = document.createElement("button");
    const label = document.createElement("span");
    const key = document.createElement("kbd");
    row.type = "button";
    row.className = "key-binding";
    row.dataset.binding = action;
    label.dataset.i18n = text;
    label.textContent = t(text);
    key.textContent = bindings[action].label;
    row.append(label, key);
    row.addEventListener("click", () => {
      selected = selected === action ? null : action;
      updateSelection();
    });
    list.append(row);
  }

  document.addEventListener("keydown", event => {
    if (!dialog.open || !selected || event.repeat || event.isComposing || !event.code || event.code === "Unidentified" ||
        event.ctrlKey || event.metaKey || event.altKey || event.key === "Alt" || event.key === "Meta" || event.key === "Control") return;

    event.preventDefault();
    const occupied = controlFor(event.code);
    if (occupied && occupied !== selected) bindings[occupied] = bindings[selected];
    const keyName = event.key === " " ? "Space" : event.key;
    const label = directions[event.code] ?? (keyName.length === 1 ? keyName.toUpperCase() : keyName);
    bindings[selected] = { code: event.code, label: label || event.code };
    writeStorage(storageKey, JSON.stringify(bindings));

    for (const row of list.children) row.querySelector("kbd").textContent = bindings[row.dataset.binding].label;
    selected = null;
    updateSelection();
  }, { capture: true });

  open.hidden = false;
  open.addEventListener("click", () => dialog.showModal());
  dialog.addEventListener("close", () => {
    selected = null;
    updateSelection();
  });
  updateSelection();
  return { controlFor };
}
