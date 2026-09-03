const DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/1KvZgpdyrhpoWedFPILttQjql-bU-zBR5?usp=sharing";

/** Shared store: Ok visible para todos los docentes y permanente entre sesiones. */
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
      { id: 1, schools: ["2", "1", "108", "155", "139", "140"] },
      { id: 2, schools: ["137", "145", "134", "111", "94", "113", "149"] },
      { id: 3, schools: ["115", "110", "86", "64", "88"] },
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
let busyKey = "";
let pollTimer = 0;

function schoolKey(sessionId, blockId, schoolId) {
  return `${sessionId}-${blockId}-${schoolId}`;
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

async function fetchOkSet() {
  const res = await fetch(STATUS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer el estado (${res.status})`);
  const data = await res.json();
  const keys = Array.isArray(data?.keys) ? data.keys.map(String) : [];
  return new Set(keys);
}

async function writeOkSet(keys) {
  const res = await fetch(STATUS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mantle-Key": STATUS_WRITE_KEY,
    },
    body: JSON.stringify({
      keys: [...keys].sort(),
      updatedAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`No se pudo guardar (${res.status})`);
}

/**
 * Apply a local change on top of the latest remote set (retry on races).
 * @param {(remote: Set<string>) => Set<string>} mutate
 */
async function updateShared(mutate) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await fetchOkSet();
    const next = mutate(new Set(remote));
    await writeOkSet(next);
    const verified = await fetchOkSet();
    okSet = verified;
    if (sameSet(verified, next)) return verified;
  }
  return okSet;
}

function markOk(key) {
  return updateShared((remote) => {
    remote.add(key);
    return remote;
  });
}

function unmarkOk(key) {
  return updateShared((remote) => {
    remote.delete(key);
    return remote;
  });
}

function setStatusMessage(text, isError = false) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
}

function createSchoolItem(sessionId, blockId, schoolId) {
  const key = schoolKey(sessionId, blockId, schoolId);
  const isOk = okSet.has(key);
  const filename = suggestedFilename(schoolId);
  const isBusy = busyKey === key;

  const li = document.createElement("li");
  li.className = `school-item${isOk ? " is-ok" : ""}`;
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

  actions.append(driveBtn, doneBtn, folderLink, tip, undoBtn);
  meta.append(fileEl, actions);
  li.append(idEl, meta);

  return li;
}

function render() {
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
  if (busyKey) return;
  try {
    const remote = await fetchOkSet();
    if (!sameSet(remote, okSet)) {
      okSet = remote;
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
  render();
  setStatusMessage("Cargando registro compartido…");
  try {
    okSet = await fetchOkSet();
    render();
    setStatusMessage("Sincronizado: el Ok se comparte entre todos los docentes.");
  } catch (err) {
    console.error(err);
    setStatusMessage("No se pudo cargar el registro. Recargá la página.", true);
  }
  startPolling();
}

init();
