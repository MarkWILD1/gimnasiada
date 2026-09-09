const DRIVE_FOLDER_ID = "1KvZgpdyrhpoWedFPILttQjql-bU-zBR5";
const DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}?usp=sharing`;

/** Shared store: Ok + textos previos visibles para todos los docentes. */
const STATUS_URL = "https://mantledb.sh/v2/gimnasiada-mp3-ok/status";
const STATUS_WRITE_KEY =
  "e008d20ce4b601602655788f1253ba324deb28ea7248ac290c395239e46fd074";
const POLL_MS = 8000;

/** @type {{ id: string, label: string, blocks: { id: number, schools: string[] }[] }[]} */
const SESSIONS = [
  {
    id: "manana",
    label: "Mañana",
    blocks: [
      { id: 1, schools: ["64", "2", "1", "108", "155", "139"] },
      { id: 2, schools: ["137", "145", "134", "111", "94", "113", "149"] },
      { id: 3, schools: ["115", "110", "86", "88"] },
    ],
  },
  {
    id: "tarde",
    label: "Tarde",
    blocks: [
      { id: 1, schools: ["143", "75", "BUS", "54", "152", "93", "141"] },
      { id: 2, schools: ["3", "2", "4", "108", "96", "S-135"] },
      { id: 3, schools: ["8", "139", "7", "120", "45", "144"] },
    ],
  },
];

/** @type {Set<string>} */
let okSet = new Set();
/** @type {Record<string, string>} */
let scripts = {};
/** @type {Set<string>} */
const openPanels = new Set();
/** @type {Record<string, string>} */
const draftScripts = {};

let busyKey = "";
let pollTimer = 0;

function schoolKey(sessionId, blockId, schoolId) {
  return `${sessionId}-${blockId}-${schoolId}`;
}

function listedSchoolKeys() {
  /** @type {string[]} */
  const keys = [];
  for (const session of SESSIONS) {
    for (const block of session.blocks) {
      for (const schoolId of block.schools) {
        keys.push(schoolKey(session.id, block.id, schoolId));
      }
    }
  }
  return keys;
}

function progressCounts() {
  const keys = listedSchoolKeys();
  let done = 0;
  for (const key of keys) {
    if (okSet.has(key)) done += 1;
  }
  return { done, total: keys.length };
}

function updateProgress() {
  const { done, total } = progressCounts();
  const okEl = document.getElementById("ok-count");
  const totalEl = document.getElementById("total-count");
  const bar = document.getElementById("progress-bar");
  const wrap = document.getElementById("upload-progress");
  if (okEl) okEl.textContent = String(done);
  if (totalEl) totalEl.textContent = String(total);
  if (bar) bar.style.width = total ? `${(done / total) * 100}%` : "0%";
  if (wrap) {
    wrap.setAttribute(
      "aria-label",
      `${done} de ${total} escuelas ya subieron el MP3`
    );
  }
}

function tabFromHash() {
  return location.hash === "#drive" ? "drive" : "orden";
}

function setActiveTab(tab) {
  const isDrive = tab === "drive";
  const ordenBtn = document.getElementById("tab-orden");
  const driveBtn = document.getElementById("tab-drive");
  const ordenPanel = document.getElementById("panel-orden");
  const drivePanel = document.getElementById("panel-drive");
  if (!ordenBtn || !driveBtn || !ordenPanel || !drivePanel) return;

  ordenBtn.classList.toggle("is-active", !isDrive);
  driveBtn.classList.toggle("is-active", isDrive);
  ordenBtn.setAttribute("aria-selected", String(!isDrive));
  driveBtn.setAttribute("aria-selected", String(isDrive));
  ordenPanel.hidden = isDrive;
  drivePanel.hidden = !isDrive;
}

function initTabs() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab") === "drive" ? "drive" : "orden";
      const nextHash = tab === "drive" ? "#drive" : "#orden";
      if (location.hash === nextHash) {
        setActiveTab(tab);
        return;
      }
      location.hash = nextHash;
    });
  });
  window.addEventListener("hashchange", () => {
    setActiveTab(tabFromHash());
  });
  setActiveTab(tabFromHash());
}

function suggestedFilename(schoolId) {
  return `escuela-${schoolId}.mp3`;
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function sameScripts(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if ((a[key] || "") !== (b[key] || "")) return false;
  }
  return true;
}

function normalizeScripts(raw) {
  /** @type {Record<string, string>} */
  const next = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) {
      next[String(key)] = value.trim();
    }
  }
  return next;
}

async function fetchStatus() {
  const res = await fetch(STATUS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer el estado (${res.status})`);
  const data = await res.json();
  return {
    keys: new Set(Array.isArray(data?.keys) ? data.keys.map(String) : []),
    scripts: normalizeScripts(data?.scripts),
  };
}

async function writeStatus(nextKeys, nextScripts) {
  const res = await fetch(STATUS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mantle-Key": STATUS_WRITE_KEY,
    },
    body: JSON.stringify({
      keys: [...nextKeys].sort(),
      scripts: nextScripts,
      updatedAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`No se pudo guardar (${res.status})`);
}

/**
 * @param {(remote: { keys: Set<string>, scripts: Record<string, string> }) => { keys: Set<string>, scripts: Record<string, string> }} mutate
 */
async function updateShared(mutate) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await fetchStatus();
    const next = mutate({
      keys: new Set(remote.keys),
      scripts: { ...remote.scripts },
    });
    await writeStatus(next.keys, next.scripts);
    const verified = await fetchStatus();
    okSet = verified.keys;
    scripts = verified.scripts;
    if (
      sameSet(verified.keys, next.keys) &&
      sameScripts(verified.scripts, next.scripts)
    ) {
      return verified;
    }
  }
  return { keys: okSet, scripts };
}

function markOk(key) {
  return updateShared((remote) => {
    remote.keys.add(key);
    return remote;
  });
}

function unmarkOk(key) {
  return updateShared((remote) => {
    remote.keys.delete(key);
    return remote;
  });
}

function saveScript(key, text) {
  const cleaned = text.trim();
  return updateShared((remote) => {
    if (cleaned) remote.scripts[key] = cleaned;
    else delete remote.scripts[key];
    return remote;
  });
}

function setStatusMessage(text, isError = false) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
}

function isEditingTextarea() {
  const active = document.activeElement;
  return Boolean(active && active.matches("textarea.script-input"));
}

function createSchoolItem(sessionId, blockId, schoolId) {
  const key = schoolKey(sessionId, blockId, schoolId);
  const isOk = okSet.has(key);
  const filename = suggestedFilename(schoolId);
  const isBusy = busyKey === key;
  const hasScript = Boolean(scripts[key]);
  const isOpen = openPanels.has(key);
  const draft =
    key in draftScripts ? draftScripts[key] : scripts[key] || "";

  const li = document.createElement("li");
  li.className = `school-item${isOk ? " is-ok" : ""}${hasScript ? " has-script" : ""}`;
  li.dataset.key = key;

  const idEl = document.createElement("div");
  idEl.className = "school-id";
  idEl.textContent = schoolId;

  const meta = document.createElement("div");
  meta.className = "school-meta";

  const fileEl = document.createElement("span");
  fileEl.className = "filename";
  fileEl.textContent = filename;
  fileEl.title = "Nombre sugerido para el archivo en Drive";

  const actions = document.createElement("div");
  actions.className = "school-actions";

  const scriptBtn = document.createElement("button");
  scriptBtn.type = "button";
  scriptBtn.className = `btn btn-script${hasScript ? " has-text" : ""}${isOpen ? " is-open" : ""}`;
  scriptBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  scriptBtn.textContent = hasScript
    ? isOpen
      ? "Ocultar texto"
      : "Ver / editar texto"
    : isOpen
      ? "Ocultar texto"
      : "Texto previo";
  scriptBtn.addEventListener("click", () => {
    if (openPanels.has(key)) {
      openPanels.delete(key);
      delete draftScripts[key];
    } else {
      openPanels.add(key);
      draftScripts[key] = scripts[key] || "";
    }
    render();
  });

  const driveBtn = document.createElement("a");
  driveBtn.className = "btn btn-primary";
  driveBtn.href = DRIVE_FOLDER_URL;
  driveBtn.target = "_blank";
  driveBtn.rel = "noopener noreferrer";
  driveBtn.textContent = "Subir en Drive";
  driveBtn.hidden = isOk;

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "btn";
  doneBtn.textContent = isBusy ? "Guardando…" : "Ya subí";
  doneBtn.hidden = isOk;
  doneBtn.disabled = isBusy;
  doneBtn.addEventListener("click", async () => {
    if (busyKey) return;
    busyKey = key;
    render();
    try {
      await markOk(key);
      setStatusMessage("Guardado: todos los docentes verán este Ok.");
    } catch (err) {
      console.error(err);
      setStatusMessage("No se pudo guardar. Probá de nuevo.", true);
    } finally {
      busyKey = "";
      render();
    }
  });

  const folderLink = document.createElement("a");
  folderLink.className = "folder-link";
  folderLink.href = DRIVE_FOLDER_URL;
  folderLink.target = "_blank";
  folderLink.rel = "noopener noreferrer";
  folderLink.textContent = "ver en carpeta";
  folderLink.hidden = !isOk;

  const tip = document.createElement("span");
  tip.className = "tip-ok";
  tip.textContent = "Ok";
  tip.hidden = !isOk;
  tip.setAttribute("role", "status");

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "btn btn-ghost";
  undoBtn.textContent = isBusy ? "…" : "Quitar Ok";
  undoBtn.hidden = !isOk;
  undoBtn.disabled = isBusy;
  undoBtn.addEventListener("click", async () => {
    if (busyKey) return;
    busyKey = key;
    render();
    try {
      await unmarkOk(key);
      setStatusMessage("Ok quitado para todos.");
    } catch (err) {
      console.error(err);
      setStatusMessage("No se pudo actualizar. Probá de nuevo.", true);
    } finally {
      busyKey = "";
      render();
    }
  });

  actions.append(scriptBtn, driveBtn, doneBtn, folderLink, tip, undoBtn);
  meta.append(fileEl, actions);
  li.append(idEl, meta);

  if (isOpen) {
    const panel = document.createElement("div");
    panel.className = "script-panel";

    const label = document.createElement("label");
    label.className = "script-label";
    label.htmlFor = `script-${key}`;
    label.textContent =
      "Texto para decir antes de la presentación de esta escuela:";

    const textarea = document.createElement("textarea");
    textarea.id = `script-${key}`;
    textarea.className = "script-input";
    textarea.rows = 4;
    textarea.placeholder =
      "Ej.: Presentamos a la Escuela N°… con su coreografía…";
    textarea.value = draft;
    textarea.disabled = isBusy;
    textarea.addEventListener("input", () => {
      draftScripts[key] = textarea.value;
    });

    const panelActions = document.createElement("div");
    panelActions.className = "script-panel-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-primary";
    saveBtn.textContent = isBusy ? "Guardando…" : "Guardar texto";
    saveBtn.disabled = isBusy;
    saveBtn.addEventListener("click", async () => {
      if (busyKey) return;
      busyKey = key;
      draftScripts[key] = textarea.value;
      render();
      try {
        await saveScript(key, draftScripts[key] || "");
        setStatusMessage("Texto guardado para todos los docentes.");
      } catch (err) {
        console.error(err);
        setStatusMessage("No se pudo guardar el texto. Probá de nuevo.", true);
      } finally {
        busyKey = "";
        render();
      }
    });

    panelActions.append(saveBtn);
    panel.append(label, textarea, panelActions);
    li.append(panel);
  }

  return li;
}

function render() {
  updateProgress();
  const root = document.getElementById("app");
  if (!root) return;

  root.replaceChildren();

  for (const session of SESSIONS) {
    const section = document.createElement("section");
    section.className = "session";
    section.setAttribute("aria-labelledby", `session-${session.id}`);

    const title = document.createElement("h2");
    title.className = "session-title";
    title.id = `session-${session.id}`;
    title.textContent = session.label;

    section.append(title);

    for (const block of session.blocks) {
      const blockEl = document.createElement("div");
      blockEl.className = "block";

      const blockTitle = document.createElement("h3");
      blockTitle.className = "block-title";
      blockTitle.textContent = `Bloque ${block.id}`;

      const list = document.createElement("ul");
      list.className = "school-list";

      for (const schoolId of block.schools) {
        list.append(createSchoolItem(session.id, block.id, schoolId));
      }

      blockEl.append(blockTitle, list);
      section.append(blockEl);
    }

    root.append(section);
  }
}

async function refreshFromServer({ silent = false } = {}) {
  if (busyKey || isEditingTextarea()) return;
  try {
    const remote = await fetchStatus();
    const changed =
      !sameSet(remote.keys, okSet) || !sameScripts(remote.scripts, scripts);
    if (changed) {
      okSet = remote.keys;
      scripts = remote.scripts;
      for (const key of Object.keys(draftScripts)) {
        if (!openPanels.has(key)) delete draftScripts[key];
      }
      render();
      if (!silent) setStatusMessage("Lista actualizada.");
    } else if (!silent) {
      setStatusMessage("Sincronizado.");
    }
  } catch (err) {
    console.error(err);
    if (!silent) {
      setStatusMessage("Sin conexión al registro compartido. Reintentando…", true);
    }
  }
}

function startPolling() {
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    refreshFromServer({ silent: true });
  }, POLL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshFromServer({ silent: true });
    }
  });
}

async function init() {
  initTabs();
  render();
  setStatusMessage("Cargando registro compartido…");
  try {
    const remote = await fetchStatus();
    okSet = remote.keys;
    scripts = remote.scripts;
    render();
    setStatusMessage("Sincronizado: Ok y textos se comparten entre docentes.");
  } catch (err) {
    console.error(err);
    setStatusMessage("No se pudo cargar el registro. Recargá la página.", true);
  }
  startPolling();
}

init();
