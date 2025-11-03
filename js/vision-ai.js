// js/vision-ai.js
import { auth, onAuthStateChanged } from "./firebase-config.js";
import { analyzeImage } from "./gemini-api.js";
import {
  createNewVisionSession,
  appendVisionMessage,
  loadVisionSession,
  loadRecentVisionSessions,
} from "../services/vision-history-service.js";

const visionMessagesEl = document.getElementById("visionMessages");
const visionFormEl = document.getElementById("visionForm");
const fileInputEl = document.getElementById("fileInput");
const historyListEl = document.getElementById("historyList");
const btnViewAllHistoryEl = document.getElementById("btnViewAllHistory");

let currentSessionId = null;
let isSending = false;

let typerTimer = null;
let fullText = "";
let shown = 0;
let textEl = null;

function renderMarkdownSafe(md) {
  const html = marked.parse(md);
  return window.DOMPurify ? DOMPurify.sanitize(html) : html;
}

function startFakeStream() {
  if (!textEl) return;
  stopFakeStream(false);
  typerTimer = setInterval(() => {
    const remain = fullText.length - shown;
    const step =
      remain > 1000 ? 24 :
      remain > 500  ? 12 :
      remain > 200  ? 6  :
      remain > 50   ? 3  : 2;
    shown = Math.min(fullText.length, shown + step);
    textEl.textContent = fullText.slice(0, shown);
    visionMessagesEl.scrollTop = visionMessagesEl.scrollHeight;
    if (shown >= fullText.length) stopFakeStream(false);
  }, 28);
}
function stopFakeStream(flushMarkdown = true) {
  if (typerTimer) clearInterval(typerTimer);
  typerTimer = null;
  if (textEl && flushMarkdown) {
    textEl.outerHTML = `<span class="ai-stream-text">${renderMarkdownSafe(fullText)}</span>`;
    textEl = null;
  }
}

function renderHistoryList(sessions) {
  if (!sessions?.length) {
    historyListEl.innerHTML = `<div class="text-center text-muted small mt-4 px-2">Chưa có lịch sử.</div>`;
    return;
  }
  historyListEl.innerHTML = "";
  sessions.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "list-group-item list-group-item-action text-start w-100";
    btn.style.border = "0";
    btn.style.borderBottom = "1px solid #eee";
    btn.style.background = "transparent";
    btn.style.padding = "0.75rem 0";
    btn.innerHTML = `
      <div class="fw-semibold text-truncate">${s.title || "Phân tích hình ảnh"}</div>
      <div class="small text-muted">${new Date(s.updatedAt).toLocaleString("vi-VN")}</div>`;
    btn.addEventListener("click", async () => {
      await handleOpenSession(s.sessionId);
    });
    historyListEl.appendChild(btn);
  });
}

async function ensureVisionSession(title = "Phân tích hình ảnh") {
  if (!currentSessionId) {
    currentSessionId = await createNewVisionSession(title);
  }
}

function renderResultBubble(fileURL) {
  const row = document.createElement("div");
  row.className = "chat-bubble-row mb-3";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble bubble-ai typing";
  bubble.innerHTML = `
    <div class="ai-stream-toolbar d-flex justify-content-end mb-1">
      <button class="btn btn-sm btn-outline-danger btn-stop me-2">⏹ Dừng</button>
      <button class="btn btn-sm btn-outline-secondary btn-regenerate" disabled>↻ Gửi lại</button>
    </div>
    <div class="ai-stream-content">
      <img src="${fileURL}" alt="Ảnh tải lên" class="img-fluid rounded mb-2" style="max-height:240px;object-fit:contain;">
      <pre class="ai-stream-raw m-0" style="white-space:pre-wrap;word-wrap:break-word;"></pre>
      <span class="spinner-border spinner-border-sm text-secondary ms-2"></span>
    </div>
  `;
  row.appendChild(bubble);
  visionMessagesEl.appendChild(row);
  visionMessagesEl.scrollTop = visionMessagesEl.scrollHeight;
  return {
    row,
    bubble,
    stopBtn: row.querySelector(".btn-stop"),
    regenBtn: row.querySelector(".btn-regenerate"),
    rawEl: row.querySelector(".ai-stream-raw"),
  };
}

async function handleSendImage(file) {
  if (isSending) return;
  isSending = true;

  const title = `Phân tích: ${file.name}`;
  await ensureVisionSession(title);

  // thay nội dung bằng khung trống
  visionMessagesEl.innerHTML = "";

  // preview + khung kết quả
  const fileURL = URL.createObjectURL(file);
  const { bubble, stopBtn, regenBtn, rawEl } = renderResultBubble(fileURL);
  textEl = rawEl;

  // gọi backend non-stream
  const { ok, answer, error } = await analyzeImage(file);
  if (!ok) {
    bubble.classList.remove("typing");
    bubble.querySelector(".spinner-border")?.remove();
    stopBtn.remove();
    regenBtn.disabled = false;
    textEl.outerHTML = `<span class="ai-stream-text text-danger">[LỖI] ${error || "Không thể phân tích ảnh."}</span>`;
    isSending = false;
    return;
  }

  fullText = String(answer || "").trim();
  shown = 0;
  startFakeStream();

  // nút Dừng
  stopBtn.addEventListener(
    "click",
    async () => {
      stopFakeStream(true);
      bubble.classList.remove("typing");
      bubble.querySelector(".spinner-border")?.remove();
      stopBtn.remove();
      regenBtn.disabled = false;

      await appendVisionMessage(currentSessionId, "user", `[Hình ảnh] ${file.name}`);
      await appendVisionMessage(currentSessionId, "ai", fullText);

      const recent = await loadRecentVisionSessions();
      renderHistoryList(recent);
      isSending = false;
    },
    { once: true }
  );

  // watcher: khi gõ xong tự lưu + dọn nút
  const doneWatch = setInterval(async () => {
    const finished = shown >= fullText.length;
    if (!finished) return;
    clearInterval(doneWatch);

    stopFakeStream(true);
    bubble.classList.remove("typing");
    bubble.querySelector(".spinner-border")?.remove();
    stopBtn.remove();
    regenBtn.disabled = false;

    await appendVisionMessage(currentSessionId, "user", `[Hình ảnh] ${file.name}`);
    await appendVisionMessage(currentSessionId, "ai", fullText);

    const recent = await loadRecentVisionSessions();
    renderHistoryList(recent);
    isSending = false;
  }, 120);

  // Gửi lại
  regenBtn.addEventListener(
    "click",
    async () => {
      if (isSending) return;
      // dùng lại file đã chọn thì cần chọn lại từ input
      alert("Vui lòng chọn lại ảnh để gửi lại.");
    },
    { once: true }
  );
}

async function handleOpenSession(sessionId) {
  currentSessionId = sessionId;
  const s = await loadVisionSession(sessionId);
  visionMessagesEl.innerHTML = "";
  s.messages.forEach((m) => {
    const row = document.createElement("div");
    row.className = "chat-bubble-row mb-3";
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${m.role === "user" ? "bubble-user" : "bubble-ai"}`;
    bubble.innerHTML = m.role === "ai" ? renderMarkdownSafe(m.text || "") : (m.text || "");
    row.appendChild(bubble);
    visionMessagesEl.appendChild(row);
  });
}

async function initPageAfterLogin() {
  currentSessionId = null;
  const recent = await loadRecentVisionSessions();
  renderHistoryList(recent);
  if (recent.length > 0) {
    await handleOpenSession(recent[0].sessionId);
  } else {
    visionMessagesEl.innerHTML = `<div class="text-center text-muted small mt-5">
      Chưa có phân tích nào. Hãy chọn hình ảnh 👇
    </div>`;
  }
}

visionFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const file = fileInputEl.files?.[0];
  if (!file) return;
  await handleSendImage(file);
  fileInputEl.value = ""; // reset input
});

btnViewAllHistoryEl.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  alert("Tính năng xem toàn bộ lịch sử sẽ được cập nhật sau.");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }
  await initPageAfterLogin();
});
