import { t } from "./i18n.js";
import { listRooms } from "./match-client.js";

export function createRoomList({ screen, ownCode, isJoining, onJoin }) {
  const refreshButton = screen.querySelector("#refresh-rooms");
  const list = screen.querySelector("#room-list");
  const status = screen.querySelector("#room-list-status");
  let request = null;
  let error = "";
  let startTouch = null;

  function update() {
    const own = ownCode();
    let visible = 0;
    for (const button of list.children) {
      button.hidden = button.value === own;
      button.disabled = Boolean(request) || isJoining();
      button.setAttribute("aria-label", t("joinListedRoom", { p0: button.value }));
      if (!button.hidden) visible++;
    }
    refreshButton.disabled = Boolean(request) || isJoining();
    const key = request ? "roomsLoading" : error || (visible ? "" : "roomsEmpty");
    const message = key ? t(key) : "";
    if (status.textContent !== message) status.textContent = message;
    status.dataset.error = Boolean(error);
  }

  async function refresh() {
    if (screen.hidden || request || isJoining()) return;
    const current = new AbortController();
    request = current;
    error = "";
    update();
    const timeout = setTimeout(() => current.abort(), 8000);
    try {
      const codes = await listRooms(ownCode(), current.signal);
      if (request !== current) return;
      list.replaceChildren(...codes.map(code => {
        const button = document.createElement("button");
        button.type = "button";
        button.value = code;
        button.textContent = code;
        button.addEventListener("click", () => onJoin(code));
        return button;
      }));
    } catch (cause) {
      if (request !== current) return;
      list.replaceChildren();
      error = cause.message === "rate_limit" ? "rate_limit" : "roomsFailed";
    } finally {
      clearTimeout(timeout);
      if (request === current) {
        request = null;
        update();
      }
    }
  }

  refreshButton.addEventListener("click", refresh);
  screen.addEventListener("touchstart", event => {
    startTouch = null;
    if (event.touches.length !== 1 || event.target.closest("input, select, textarea")) return;
    const touch = event.touches[0];
    const viewport = window.visualViewport;
    const bottom = viewport ? viewport.pageTop + viewport.height : window.scrollY + window.innerHeight;
    if (bottom + 3 < document.scrollingElement.scrollHeight || bottom - touch.pageY > 60) return;
    startTouch = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  screen.addEventListener("touchmove", event => {
    if (!startTouch) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== startTouch.id) { startTouch = null; return; }
    const up = startTouch.y - touch.clientY;
    if (up > 12 && up > Math.abs(touch.clientX - startTouch.x) * 1.5 && event.cancelable) event.preventDefault();
  }, { passive: false });
  screen.addEventListener("touchend", event => {
    const start = startTouch;
    startTouch = null;
    const touch = event.changedTouches[0];
    if (!start || event.touches.length || touch?.identifier !== start.id) return;
    const up = start.y - touch.clientY;
    if (up < 60 || up < Math.abs(touch.clientX - start.x) * 1.5) return;
    if (event.cancelable) event.preventDefault();
    void refresh();
  }, { passive: false });
  screen.addEventListener("touchcancel", () => { startTouch = null; });

  return {
    refresh, update,
    remove(code) {
      for (const button of list.children) {
        if (button.value === code) { button.remove(); break; }
      }
      update();
    },
    close() {
      request?.abort();
      request = null;
      startTouch = null;
      error = "";
      list.replaceChildren();
    },
  };
}
