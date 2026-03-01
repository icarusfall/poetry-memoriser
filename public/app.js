// --- Storage ---
function getPoems() {
  return JSON.parse(localStorage.getItem("poems") || "[]");
}

function savePoems(poems) {
  localStorage.setItem("poems", JSON.stringify(poems));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- DOM refs ---
const homeView = document.getElementById("home-view");
const practiceView = document.getElementById("practice-view");

const addPoemBtn = document.getElementById("add-poem-btn");
const addPoemForm = document.getElementById("add-poem-form");
const cancelAddBtn = document.getElementById("cancel-add-btn");
const titleInput = document.getElementById("poem-title-input");
const authorInput = document.getElementById("poem-author-input");
const urlInput = document.getElementById("poem-url-input");
const fetchBtn = document.getElementById("fetch-btn");
const fetchStatus = document.getElementById("fetch-status");
const poemList = document.getElementById("poem-list");
const emptyState = document.getElementById("empty-state");

const backBtn = document.getElementById("back-btn");
const practiceTitle = document.getElementById("practice-title");
const practiceAuthor = document.getElementById("practice-author");
const progressBar = document.getElementById("progress-bar");
const linesContainer = document.getElementById("lines-container");
const revealBtn = document.getElementById("reveal-btn");
const practiceControls = document.getElementById("practice-controls");
const sessionResult = document.getElementById("session-result");
const resultScore = document.getElementById("result-score");
const resultBackBtn = document.getElementById("result-back-btn");

// --- State ---
let currentPoemId = null;
let revealedCount = 0;
let scores = {}; // lineIndex -> true/false

// --- Navigation ---
function showHome() {
  homeView.classList.remove("hidden");
  practiceView.classList.add("hidden");
  currentPoemId = null;
  renderPoemList();
}

function showPractice(poemId) {
  homeView.classList.add("hidden");
  practiceView.classList.remove("hidden");
  sessionResult.classList.add("hidden");
  practiceControls.classList.remove("hidden");
  revealBtn.classList.remove("hidden");
  linesContainer.innerHTML = "";
  currentPoemId = poemId;
  revealedCount = 0;
  scores = {};

  const poem = getPoems().find((p) => p.id === poemId);
  if (!poem) return showHome();

  practiceTitle.textContent = poem.title;
  practiceAuthor.textContent = poem.author;
  updateProgress(poem);
}

// --- Render poem list ---
function renderPoemList() {
  const poems = getPoems();
  poemList.innerHTML = "";

  if (poems.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  poems.forEach((poem) => {
    const card = document.createElement("div");
    card.className = "poem-card";

    const info = document.createElement("div");
    info.className = "poem-card-info";
    info.innerHTML = `<h3>${escapeHtml(poem.title)}</h3><p>${escapeHtml(poem.author)}</p>`;

    const scoreDiv = document.createElement("div");
    scoreDiv.className = "poem-card-score";

    if (poem.sessions && poem.sessions.length > 0) {
      const last = poem.sessions[poem.sessions.length - 1];
      const pct = Math.round((last.correct / last.total) * 100);
      const cls = pct >= 80 ? "score-high" : pct >= 50 ? "score-mid" : "score-low";
      scoreDiv.innerHTML = `<span class="score-pct ${cls}">${pct}%</span>${poem.sessions.length} session${poem.sessions.length === 1 ? "" : "s"}`;
    } else {
      scoreDiv.textContent = "Not practised";
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "poem-card-delete";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.title = "Delete poem";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${poem.title}"?`)) {
        const poems = getPoems().filter((p) => p.id !== poem.id);
        savePoems(poems);
        renderPoemList();
      }
    });

    card.addEventListener("click", () => showPractice(poem.id));
    card.appendChild(info);
    card.appendChild(scoreDiv);
    card.appendChild(deleteBtn);
    poemList.appendChild(card);
  });
}

// --- Add poem ---
addPoemBtn.addEventListener("click", () => {
  addPoemBtn.classList.add("hidden");
  addPoemForm.classList.remove("hidden");
  titleInput.focus();
});

cancelAddBtn.addEventListener("click", () => {
  addPoemForm.classList.add("hidden");
  addPoemBtn.classList.remove("hidden");
  fetchStatus.classList.add("hidden");
  addPoemForm.reset();
});

addPoemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const author = authorInput.value.trim();
  const url = urlInput.value.trim();

  if (!title && !url) {
    fetchStatus.textContent = "Enter a poem title or paste a URL";
    fetchStatus.className = "error";
    fetchStatus.classList.remove("hidden");
    return;
  }

  fetchBtn.disabled = true;
  fetchStatus.textContent = "Fetching poem...";
  fetchStatus.className = "loading";
  fetchStatus.classList.remove("hidden");

  try {
    const res = await fetch("/api/fetch-poem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || undefined, author: author || undefined, url: url || undefined }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to fetch poem");
    }

    const poem = await res.json();

    const poems = getPoems();
    poems.push({
      id: generateId(),
      title: poem.title,
      author: poem.author,
      lines: poem.lines,
      sessions: [],
    });
    savePoems(poems);

    addPoemForm.reset();
    addPoemForm.classList.add("hidden");
    addPoemBtn.classList.remove("hidden");
    fetchStatus.classList.add("hidden");
    renderPoemList();
  } catch (err) {
    fetchStatus.textContent = err.message;
    fetchStatus.className = "error";
  } finally {
    fetchBtn.disabled = false;
  }
});

// --- Practice ---
function updateProgress(poem) {
  const total = poem.lines.filter((l) => l.trim() !== "").length;
  const pct = total > 0 ? (revealedCount / total) * 100 : 0;
  progressBar.style.width = Math.min(pct, 100) + "%";
}

revealBtn.addEventListener("click", () => {
  const poem = getPoems().find((p) => p.id === currentPoemId);
  if (!poem) return;

  const lineIndex = revealedCount;
  // Skip blank lines automatically
  let idx = 0;
  let actualLine = 0;
  for (let i = 0; i < poem.lines.length; i++) {
    if (idx === lineIndex && poem.lines[i].trim() === "") {
      // Show blank line without buttons
      const row = document.createElement("div");
      row.className = "line-row";
      row.innerHTML = '<span class="line-text blank-line"></span>';
      linesContainer.appendChild(row);
    }
    if (poem.lines[i].trim() !== "") {
      if (actualLine === lineIndex) {
        revealLine(poem, i, lineIndex);
        revealedCount++;
        // Also reveal any trailing blank lines
        for (let j = i + 1; j < poem.lines.length && poem.lines[j].trim() === ""; j++) {
          const blankRow = document.createElement("div");
          blankRow.className = "line-row";
          blankRow.innerHTML = '<span class="line-text blank-line"></span>';
          linesContainer.appendChild(blankRow);
        }
        break;
      }
      actualLine++;
    }
  }

  const contentLines = poem.lines.filter((l) => l.trim() !== "");
  updateProgress(poem);

  if (revealedCount >= contentLines.length) {
    revealBtn.classList.add("hidden");
  }

  // Scroll to bottom
  linesContainer.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

function revealLine(poem, poemLineIndex, scoreIndex) {
  const row = document.createElement("div");
  row.className = "line-row";

  const text = document.createElement("span");
  text.className = "line-text";
  text.textContent = poem.lines[poemLineIndex];

  const buttons = document.createElement("span");
  buttons.className = "line-buttons";

  const yesBtn = document.createElement("button");
  yesBtn.className = "btn-yes";
  yesBtn.textContent = "Yes";

  const noBtn = document.createElement("button");
  noBtn.className = "btn-no";
  noBtn.textContent = "No";

  yesBtn.addEventListener("click", () => {
    scores[scoreIndex] = true;
    yesBtn.classList.add("selected");
    noBtn.classList.remove("selected");
    checkComplete(poem);
  });

  noBtn.addEventListener("click", () => {
    scores[scoreIndex] = false;
    noBtn.classList.add("selected");
    yesBtn.classList.remove("selected");
    checkComplete(poem);
  });

  buttons.appendChild(yesBtn);
  buttons.appendChild(noBtn);
  row.appendChild(text);
  row.appendChild(buttons);
  linesContainer.appendChild(row);
}

function checkComplete(poem) {
  const contentLines = poem.lines.filter((l) => l.trim() !== "");
  const allRevealed = revealedCount >= contentLines.length;
  const allScored = Object.keys(scores).length >= contentLines.length;

  if (allRevealed && allScored) {
    finishSession(poem);
  }
}

function finishSession(poem) {
  const total = Object.keys(scores).length;
  const correct = Object.values(scores).filter(Boolean).length;
  const pct = Math.round((correct / total) * 100);

  // Save session
  const poems = getPoems();
  const p = poems.find((x) => x.id === poem.id);
  if (p) {
    if (!p.sessions) p.sessions = [];
    p.sessions.push({
      date: new Date().toISOString().slice(0, 10),
      correct,
      total,
    });
    savePoems(poems);
  }

  practiceControls.classList.add("hidden");
  const cls = pct >= 80 ? "score-high" : pct >= 50 ? "score-mid" : "score-low";
  resultScore.innerHTML = `You got <span class="${cls}">${correct}/${total} (${pct}%)</span>`;
  sessionResult.classList.remove("hidden");
  sessionResult.scrollIntoView({ behavior: "smooth" });
}

backBtn.addEventListener("click", showHome);
resultBackBtn.addEventListener("click", showHome);

// --- Utilities ---
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Init ---
renderPoemList();
