const DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/1KvZgpdyrhpoWedFPILttQjql-bU-zBR5?usp=sharing";

const STORAGE_KEY = "gimnasiada-uploads-ok";

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

function schoolKey(sessionId, blockId, schoolId) {
  return `${sessionId}-${blockId}-${schoolId}`;
}

function suggestedFilename(schoolId) {
  return `escuela-${schoolId}.mp3`;
}

function loadOkSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String));
  } catch {
    return new Set();
  }
}

function saveOkSet(okSet) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...okSet]));
}

function markOk(key) {
  const okSet = loadOkSet();
  okSet.add(key);
  saveOkSet(okSet);
}

function unmarkOk(key) {
  const okSet = loadOkSet();
  okSet.delete(key);
  saveOkSet(okSet);
}

function createSchoolItem(sessionId, blockId, schoolId, okSet) {
  const key = schoolKey(sessionId, blockId, schoolId);
  const isOk = okSet.has(key);
  const filename = suggestedFilename(schoolId);

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
  doneBtn.textContent = "Ya subí";
  doneBtn.hidden = isOk;
  doneBtn.addEventListener("click", () => {
    markOk(key);
    render();
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
  undoBtn.textContent = "Quitar Ok";
  undoBtn.hidden = !isOk;
  undoBtn.addEventListener("click", () => {
    unmarkOk(key);
    render();
  });

  actions.append(driveBtn, doneBtn, folderLink, tip, undoBtn);
  meta.append(fileEl, actions);
  li.append(idEl, meta);

  return li;
}

function render() {
  const root = document.getElementById("app");
  if (!root) return;

  const okSet = loadOkSet();
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
        list.append(createSchoolItem(session.id, block.id, schoolId, okSet));
      }

      blockEl.append(blockTitle, list);
      section.append(blockEl);
    }

    root.append(section);
  }
}

render();
