// js/study-assistant.js
import { auth, onAuthStateChanged } from "./firebase-config.js";
import { analyzePdf } from "./gemini-api.js";
import {
  createNewStudySession,
  appendStudyMessage,
  loadStudySession,
  loadRecentStudySessions,
} from "../services/study-assistant-history.js";

const studyMessagesEl = document.getElementById("studyMessages");
const studyFormEl = document.getElementById("studyForm");
const pdfInputEl = document.getElementById("pdfInput");
const questionInputEl = document.getElementById("questionInput");
const historyListEl = document.getElementById("historyList");
const btnNewStudySessionEl = document.getElementById("btnNewStudySession");
const btnViewAllHistoryEl = document.getElementById("btnViewAllHistory");

let currentSessionId = null;
let isSending = false;

// fake stream state
let typerTimer = null;
let fullText = "";
let shown = 0;
let textEl = null;

function renderMarkdownSafe(md) {
  const html = marked.parse(md);
  return window.DOMPurify ? DOMPurify.sanitize(html) : html;
}

function resetTyping() {
  if (typerTimer) clearInterval(typerTimer);
  typerTimer = null;
  fullText = "";
  shown = 0;
  textEl = null;
}

function startFakeStream() {
  if (!textEl) return;
  if (typerTimer) clearInterval(typerTimer);

  typerTimer = setInterval(() => {
    const remain = fullText.length - shown;
    const step =
      remain > 1000 ? 24 :
      remain > 500  ? 12 :
      remain > 200  ? 6  :
      remain > 50   ? 3  : 2;

    shown = Math.min(fullText.length, shown + step);
    textEl.textContent = fullText.slice(0, shown);
    studyMessagesEl.scrollTop = studyMessagesEl.scrollHeight;

    if (shown >= fullText.length) {
      stopFakeStream(false);
    }
  }, 28);
}

function stopFakeStream(flushMarkdown = true) {
  if (typerTimer) clearInterval(typerTimer);
  typerTimer = null;
  if (flushMarkdown && textEl) {
    const html = renderMarkdownSafe(fullText);
    textEl.outerHTML = `<span class="ai-stream-text">${html}</span>`;
    textEl = null;
  }
}

function renderHistoryList(sessions) {
  if (!sessions || sessions.length === 0) {
    historyListEl.innerHTML = `
      <div class="text-center text-muted small mt-4 px-2">
        Chưa có lịch sử.
      </div>
    `;
    return;
  }

  historyListEl.innerHTML = "";
  sessions.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "list-group-item list-group-item-action text-start w-100 history-item-btn";
    btn.style.border = "0";
    btn.style.borderBottom = "1px solid #eee";
    btn.style.background = "transparent";
    btn.style.padding = "0.75rem 0";

    const titleSafe = s.title?.trim() ? s.title : "(Không tiêu đề)";
    btn.innerHTML = `
      <div class="fw-semibold text-truncate">${titleSafe}</div>
      <div class="small text-muted">
        ${new Date(s.updatedAt).toLocaleString("vi-VN")}
      </div>
    `;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleOpenSession(s.sessionId);
    });

    historyListEl.appendChild(btn);
  });
}

function renderMessages(messages, { append = false } = {}) {
  if (!messages || messages.length === 0) {
    studyMessagesEl.innerHTML = `
      <div class="text-center text-muted small mt-5">
        Chưa có phiên học nào. Hãy chọn file PDF và đặt câu hỏi 👇
      </div>
    `;
    return;
  }

  if (!append) studyMessagesEl.innerHTML = "";

  messages.forEach((m) => {
    const row = document.createElement("div");
    row.className = "chat-bubble-row mb-3";

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${
      m.role === "user" ? "bubble-user" : "bubble-ai"
    }`;

    if (m.role === "ai") {
      bubble.innerHTML = renderMarkdownSafe(m.text || "");
    } else {
      bubble.textContent = m.text || "";
    }

    row.appendChild(bubble);
    studyMessagesEl.appendChild(row);
  });

  studyMessagesEl.scrollTop = studyMessagesEl.scrollHeight;
}

function renderSingleMessage(message) {
  const row = document.createElement("div");
  row.className = "chat-bubble-row mb-3";

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${
    message.role === "user" ? "bubble-user" : "bubble-ai"
  }`;

  if (message.role === "ai") {
    bubble.innerHTML = renderMarkdownSafe(message.text || "");
  } else {
    bubble.textContent = message.text || "";
  }

  row.appendChild(bubble);
  studyMessagesEl.appendChild(row);
  studyMessagesEl.scrollTop = studyMessagesEl.scrollHeight;
}

function createAiBubble(pdfName) {
  const row = document.createElement("div");
  row.className = "chat-bubble-row mb-3";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble bubble-ai typing";
  bubble.innerHTML = `
    <div class="small text-muted mb-1">
      📄 ${pdfName || "Tài liệu PDF"}
    </div>
    <div class="ai-stream-toolbar d-flex justify-content-end mb-1">
      <button class="btn btn-sm btn-outline-danger btn-stop me-2">⏹ Dừng</button>
      <button class="btn btn-sm btn-outline-secondary btn-regenerate" disabled>↻ Gửi lại</button>
    </div>
    <div class="ai-stream-content">
      <pre class="ai-stream-raw m-0" style="white-space:pre-wrap;word-wrap:break-word;"></pre>
      <span class="spinner-border spinner-border-sm text-secondary ms-2"></span>
    </div>
  `;

  row.appendChild(bubble);
  studyMessagesEl.appendChild(row);
  studyMessagesEl.scrollTop = studyMessagesEl.scrollHeight;

  return {
    row,
    bubble,
    stopBtn: row.querySelector(".btn-stop"),
    regenBtn: row.querySelector(".btn-regenerate"),
    rawEl: row.querySelector(".ai-stream-raw"),
  };
}

async function ensureStudySession(title = "Phiên học với PDF") {
  if (!currentSessionId) {
    currentSessionId = await createNewStudySession(title);
  }
}

async function handleAskFromPdf(file, question) {
  if (isSending) return;
  isSending = true;

  resetTyping();
  const title = question?.slice(0, 80) || "Phiên học với PDF";
  await ensureStudySession(title);

  // hiển thị câu hỏi user
  renderSingleMessage({ role: "user", text: question });

  // tạo bubble AI
  const { bubble, stopBtn, regenBtn, rawEl } = createAiBubble(file.name);
  textEl = rawEl;

  // gọi backend
  const { ok, answer, error } = await analyzePdf(file, question);

  if (!ok) {
    bubble.classList.remove("typing");
    bubble.querySelector(".spinner-border")?.remove();
    stopBtn.remove();
    regenBtn.disabled = false;
    textEl.outerHTML = `<span class="ai-stream-text text-danger">[LỖI] ${
      error || "Không thể đọc PDF."
    }</span>`;
    isSending = false;
    return;
  }

  fullText = String(answer || "").trim();
  shown = 0;
  startFakeStream();

  // xử lý Dừng
  stopBtn.addEventListener(
    "click",
    async () => {
      stopFakeStream(true);
      bubble.classList.remove("typing");
      bubble.querySelector(".spinner-border")?.remove();
      stopBtn.remove();
      regenBtn.disabled = false;

      await appendStudyMessage(currentSessionId, "user", question, {
        pdfName: file.name,
      });
      await appendStudyMessage(currentSessionId, "ai", fullText, {
        pdfName: file.name,
      });

      const recent = await loadRecentStudySessions();
      renderHistoryList(recent);
      isSending = false;
    },
    { once: true }
  );

  // watcher: khi gõ xong tự lưu
  const watcher = setInterval(async () => {
    const finished = shown >= fullText.length;
    if (!finished) return;
    clearInterval(watcher);

    stopFakeStream(true);
    bubble.classList.remove("typing");
    bubble.querySelector(".spinner-border")?.remove();
    stopBtn.remove();
    regenBtn.disabled = false;

    await appendStudyMessage(currentSessionId, "user", question, {
      pdfName: file.name,
    });
    await appendStudyMessage(currentSessionId, "ai", fullText, {
      pdfName: file.name,
    });

    const recent = await loadRecentStudySessions();
    renderHistoryList(recent);
    isSending = false;
  }, 120);

  // Gửi lại: yêu cầu user chọn lại cùng file + câu hỏi
  regenBtn.addEventListener(
    "click",
    async () => {
      if (isSending) return;
      // ở đây có thể auto điền lại câu hỏi, nhưng vẫn cần file → để đơn giản hiển thị thông báo
      alert("Để hỏi lại, vui lòng chọn lại file PDF và câu hỏi.");
    },
    { once: true }
  );
}

async function handleOpenSession(sessionId) {
  currentSessionId = sessionId;
  const s = await loadStudySession(sessionId);
  renderMessages(s.messages);
}

async function initPageAfterLogin() {
  currentSessionId = null;
  const recent = await loadRecentStudySessions();
  renderHistoryList(recent);

  if (recent.length > 0) {
    await handleOpenSession(recent[0].sessionId);
  } else {
    renderMessages([]);
  }
}

// ========== EVENT LISTENERS ==========
studyFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const file = pdfInputEl.files?.[0];
  const question = questionInputEl.value.trim();
  if (!file || !question) return;

  questionInputEl.value = "";
  await handleAskFromPdf(file, question);
});

btnNewStudySessionEl.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  currentSessionId = await createNewStudySession();
  const s = await loadStudySession(currentSessionId);
  renderMessages(s.messages);

  const recent = await loadRecentStudySessions();
  renderHistoryList(recent);
});

btnViewAllHistoryEl.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  alert("Tính năng xem toàn bộ lịch sử sẽ được cập nhật sau.");
});

// Auth guard
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }
  await initPageAfterLogin();
});
