"use strict";
const electron = require("electron");
const GUARD_AUTO_IDLE_MS = 1500;
const IDLE = { phase: "idle", fireAt: null };
function reduceGuard(state, event) {
  switch (event.type) {
    case "arm":
      return { phase: "armed", fireAt: null };
    case "drop":
      return IDLE;
    case "dragEnd":
      if (state.phase !== "armed") return state;
      return { phase: "releasing", fireAt: event.now + GUARD_AUTO_IDLE_MS };
    case "tick":
      if (state.phase !== "releasing" || state.fireAt === null) return state;
      if (event.now >= state.fireAt) return IDLE;
      return state;
    default:
      return state;
  }
}
function isGuarded(state) {
  return state.phase !== "idle";
}
const SCHEME_LINK = /^(?:https?:\/\/|www\.)[^\s]+$/i;
const MAILTO = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const TEL = /^tel:\+?[\d\s().-]{5,}$/i;
const TLDS = /* @__PURE__ */ new Set([
  "com",
  "net",
  "org",
  "edu",
  "gov",
  "mil",
  "int",
  "info",
  "biz",
  "io",
  "co",
  "ai",
  "app",
  "dev",
  "me",
  "tv",
  "in",
  "uk",
  "us",
  "ca",
  "au",
  "de",
  "fr",
  "jp",
  "cn",
  "ru",
  "br",
  "it",
  "es",
  "nl",
  "se",
  "no",
  "fi",
  "dk",
  "pl",
  "ch",
  "at",
  "be",
  "ie",
  "nz",
  "za",
  "sg",
  "hk",
  "tw",
  "kr",
  "id",
  "my",
  "ph",
  "vn",
  "th",
  "tr",
  "ae",
  "sa",
  "il",
  "eg",
  "ng",
  "ke",
  "pk",
  "bd",
  "lk",
  "np",
  "mx",
  "ar",
  "cl",
  "pe",
  "eu",
  "asia",
  "xyz",
  "online",
  "site",
  "tech",
  "store",
  "shop",
  "blog",
  "news",
  "live",
  "link",
  "page",
  "cloud",
  "email",
  "so",
  "gg",
  "ly",
  "to",
  "fm",
  "sh",
  "md",
  "py",
  "rs",
  "cc",
  "ws",
  "one",
  "zip",
  "mov",
  "design",
  "studio",
  "art",
  "wiki",
  "top",
  "icu",
  "pro",
  "gl",
  "gd",
  "is"
]);
const NEEDS_PATH = /* @__PURE__ */ new Set(["md", "py", "rs", "sh", "pl", "cc", "zip", "mov", "ai", "so", "app", "is", "to", "gd"]);
const BARE_LINK = /^((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+)([a-z]{2,24})(:\d{2,5})?([/?#][^\s]*)?$/i;
function isLinkText(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t || t.length > 8192) return false;
  if (SCHEME_LINK.test(t) || MAILTO.test(t) || TEL.test(t)) return true;
  const m = BARE_LINK.exec(t);
  if (!m) return false;
  const tld = m[2].toLowerCase();
  if (!TLDS.has(tld)) return false;
  if (NEEDS_PATH.has(tld) && !m[4]) return false;
  return true;
}
function invoke(channel, ...args) {
  return electron.ipcRenderer.invoke(channel, ...args);
}
function send(channel, ...args) {
  electron.ipcRenderer.send(channel, ...args);
}
function on(channel, listener) {
  const wrapped = (_e, ...args) => listener(...args);
  electron.ipcRenderer.on(channel, wrapped);
  return () => electron.ipcRenderer.off(channel, wrapped);
}
let guard = { phase: "idle", fireAt: null };
let guardIdleTimer = null;
function dispatchGuard(event) {
  guard = reduceGuard(guard, event);
  if (event.type === "dragEnd" && guard.phase === "releasing") {
    if (guardIdleTimer) clearTimeout(guardIdleTimer);
    const remaining = (guard.fireAt ?? Date.now()) - Date.now();
    guardIdleTimer = setTimeout(() => {
      dispatchGuard({ type: "tick", now: Date.now() });
      guardIdleTimer = null;
    }, Math.max(1, remaining));
  }
}
function setInternalDragState(active) {
  if (active) {
    dispatchGuard({ type: "arm" });
  } else {
    dispatchGuard({ type: "dragEnd", now: Date.now() });
  }
}
const win = globalThis.window || globalThis;
win.addEventListener("dragstart", () => {
  setInternalDragState(true);
}, true);
win.addEventListener("dragend", () => {
  setInternalDragState(false);
}, true);
win.addEventListener("dragover", (e) => {
  e.preventDefault();
}, false);
win.addEventListener("drop", (e) => {
  if (isGuarded(guard)) {
    dispatchGuard({ type: "drop" });
    if (guardIdleTimer) {
      clearTimeout(guardIdleTimer);
      guardIdleTimer = null;
    }
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  const dt = e.dataTransfer;
  if (!dt) return;
  const files = dt.files;
  if (files && files.length > 0) {
    const paths = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const p = electron.webUtils.getPathForFile(files[i]);
        if (p) paths.push(p);
      } catch {
      }
    }
    if (paths.length > 0) {
      e.preventDefault();
      invoke("item:add-files", paths).catch(console.error);
      return;
    }
  }
  const uriList = dt.getData("text/uri-list") || dt.getData("URL");
  const plainText = dt.getData("text/plain")?.trim();
  const htmlText = dt.getData("text/html")?.trim();
  if (uriList) {
    const urls = uriList.split(/\r?\n/).map((u) => u.trim()).filter((u) => u && !u.startsWith("#"));
    if (urls.length > 0) {
      const url = urls[0];
      const isImg = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url) || /^data:image\//i.test(url);
      e.preventDefault();
      if (isImg) {
        invoke("item:add-data", {
          kind: "image",
          imageId: "",
          width: 0,
          height: 0,
          bytes: 0,
          imageUrl: url
        }).catch(console.error);
      } else {
        invoke("item:add-data", {
          kind: "text",
          text: url,
          isUrl: true
        }).catch(console.error);
      }
      return;
    }
  }
  if (plainText) {
    e.preventDefault();
    const isUrl = isLinkText(plainText);
    const isColor = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(plainText);
    invoke("item:add-data", {
      kind: "text",
      text: plainText,
      html: htmlText && htmlText !== plainText ? htmlText : void 0,
      isUrl,
      isColor
    }).catch(console.error);
  }
}, true);
const api = {
  /* Renderer -> Main */
  loadState: () => invoke("state:load"),
  setPinned: (id, pinned) => invoke("item:set-pinned", id, pinned),
  deleteItem: (id) => invoke("item:delete", id),
  deleteBatchItems: (ids) => invoke("item:delete-batch", ids),
  clearItems: () => invoke("item:clear"),
  getFullText: (id) => invoke("item:get-full-text", id),
  copyItem: (id) => invoke("item:copy", id),
  copySubitem: (req) => invoke("item:copy-subitem", req),
  pasteItem: (id, opts) => invoke("item:paste", id, opts),
  setItemMeta: (id, meta) => invoke("item:set-meta", id, meta),
  copyText: (text) => invoke("item:copy-text", text),
  saveImages: (id) => invoke("item:save-images", id),
  pasteSubitem: (req) => invoke("item:paste-subitem", req),
  pasteEmoji: (text) => invoke("emoji:paste", text),
  emojiGlyphs: (files) => invoke("emoji:glyphs", files),
  iconSvg: (kind) => invoke("icon:svg", kind),
  installUpdate: () => invoke("app:install-update"),
  checkForUpdatesManual: () => invoke("updater:check-manual"),
  startUpdateDownload: () => invoke("updater:start-download"),
  getUpdateState: () => invoke("updater:get-state"),
  quitApp: () => invoke("app:quit"),
  startDrag: (req) => {
    setInternalDragState(true);
    send("item:start-drag", req);
  },
  prestageDrag: (req) => send("item:prestage-drag", req),
  addFiles: (paths) => invoke("item:add-files", paths),
  addItemData: (data) => invoke("item:add-data", data),
  removeSubitem: (req) => invoke("item:remove-subitem", req),
  mergeItems: (sourceId, targetId) => invoke("item:merge", sourceId, targetId),
  splitItem: (req) => invoke("item:split", req),
  getDisplays: () => invoke("displays:list"),
  updateSettings: (patch) => invoke("settings:update", patch),
  refreshLaunchAtLogin: () => invoke("startup:refresh"),
  setInteractive: (value) => invoke("window:set-interactive", value),
  setPreviewMode: (active) => invoke("window:set-preview-mode", active),
  pauseHotkey: (paused) => invoke("hotkey:pause", paused),
  revealFile: (path) => invoke("file:reveal", path),
  minimizeWindow: () => invoke("window:minimize"),
  focusWindow: (focusable) => invoke("window:focus", focusable),
  setInternalDrag: (active) => {
    setInternalDragState(active);
  },
  broadcastTutorialStep: (step) => send("tutorial:set-step", step),
  resyncHover: () => send("window:resync-hover"),
  /* Main -> Renderer */
  onItems: (cb) => on("state:items", cb),
  onSettings: (cb) => on("state:settings", cb),
  onToggle: (cb) => on("window:toggle", cb),
  onOpenSettings: (cb) => on("window:open-settings", cb),
  onDragEnd: (cb) => {
    return on("item:drag-end", () => {
      setInternalDragState(false);
      cb();
    });
  },
  onInternalDrop: (cb) => on("item:internal-drop", cb),
  onCursorEdge: (cb) => on("window:cursor-edge", cb),
  onToast: (cb) => on("ui:toast", cb),
  onCopyFlare: (cb) => on("ui:copy-flare", cb),
  onTutorialStep: (cb) => on("tutorial:step", cb),
  onUpdateAvailable: (cb) => on("app:update-available", cb),
  onUpdateProgress: (cb) => on("app:update-progress", cb),
  onUpdateDownloaded: (cb) => on("app:update-downloaded", cb)
  /* Drag helpers */
  // (Handled natively by capturing drop event above)
};
electron.contextBridge.exposeInMainWorld("edge", api);
