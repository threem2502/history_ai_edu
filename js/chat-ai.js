// js/chat-ai.js
import { auth, onAuthStateChanged } from "./firebase-config.js";
import { askGemini } from "./gemini-api.js";
import {
  createNewSession,
  appendMessage,
  loadSession,
  loadRecentSessions,
} from "../services/history-service.js";

const chatMessagesEl = document.getElementById("chatMessages");
const askFormEl = document.getElementById("askForm");
const askInputEl = document.getElementById("askInput");
const historyListEl = document.getElementById("historyList");
const btnNewChatEl = document.getElementById("btnNewChat");
const btnViewAllHistoryEl = document.getElementById("btnViewAllHistory");

let currentSessionId = null;
let isSending = false;

function renderMessages(messages) {
  if (!messages || messages.length === 0) {
    chatMessagesEl.innerHTML = `
      <div class="text-center text-muted small mt-5">
        Chưa có tin nhắn nào. Hãy đặt câu hỏi đầu tiên 👇
      </div>
    `;
    return;
  }

  chatMessagesEl.innerHTML = "";

  messages.forEach((m) => {
    const wrap = document.createElement("div");
    wrap.classList.add("chat-bubble-row", "mb-3");

    const bubble = document.createElement("div");
    bubble.classList.add(
      "chat-bubble",
      m.role === "user" ? "bubble-user" : "bubble-ai"
    );

    bubble.textContent = m.text;
    wrap.appendChild(bubble);
    chatMessagesEl.appendChild(wrap);
  });

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function appendTempLoaderBubble() {
  const wrap = document.createElement("div");
  wrap.classList.add("chat-bubble-row", "mb-3");

  const bubble = document.createElement("div");
  bubble.classList.add("chat-bubble", "bubble-ai");

  bubble.innerHTML = `
    <div class="d-flex align-items-center gap-2 text-muted small">
      <div class="spinner-border spinner-border-sm" role="status"></div>
      <span>AI đang trả lời...</span>
    </div>
  `;

  wrap.dataset.loaderBubble = "1";
  wrap.appendChild(bubble);
  chatMessagesEl.appendChild(wrap);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function removeTempLoaderBubble() {
  const loader = chatMessagesEl.querySelector('[data-loader-bubble="1"]');
  if (loader) loader.remove();
}

function renderHistoryList(sessions) {
  if (!sessions || sessions.length === 0) {
    historyListEl.innerHTML = `
      <div class="text-center text-muted small mt-4 px-2">
        Chưa có lịch sử.
        <br />
        Sau khi bạn hỏi AI, câu hỏi sẽ xuất hiện ở đây để mở lại sau.
      </div>
    `;
    return;
  }

  historyListEl.innerHTML = "";

  sessions.forEach((s) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "list-group-item list-group-item-action text-start w-100 history-item-btn";
    item.style.border = "0";
    item.style.borderBottom = "1px solid #eee";
    item.style.background = "transparent";
    item.style.padding = "0.75rem 0";

    const titleSafe =
      s.title && s.title.trim() !== "" ? s.title : "(Không tiêu đề)";

    item.innerHTML = `
      <div class="fw-semibold text-truncate">${titleSafe}</div>
      <div class="small text-muted">
        ${new Date(s.updatedAt).toLocaleString("vi-VN")}
      </div>
    `;

    item.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleOpenSession(s.sessionId);
    });

    historyListEl.appendChild(item);
  });
}

async function ensureSession() {
  if (!currentSessionId) {
    currentSessionId = await createNewSession();
  }
}

async function handleSendMessage(questionText) {
  if (isSending) return;
  isSending = true;

  await ensureSession();

  await appendMessage(currentSessionId, "user", questionText);

  const cur = await loadSession(currentSessionId);
  renderMessages(cur.messages);

  appendTempLoaderBubble();

  const aiAnswer = await askGemini(questionText, currentSessionId);

  removeTempLoaderBubble();
  await appendMessage(currentSessionId, "ai", aiAnswer);

  const updated = await loadSession(currentSessionId);
  renderMessages(updated.messages);

  const recent = await loadRecentSessions();
  renderHistoryList(recent);

  isSending = false;
}

async function handleOpenSession(sessionId) {
  currentSessionId = sessionId;
  const s = await loadSession(sessionId);
  renderMessages(s.messages);
}

async function initPageAfterLogin() {
  currentSessionId = null;

  const recent = await loadRecentSessions();
  renderHistoryList(recent);

  if (recent.length > 0) {
    await handleOpenSession(recent[0].sessionId);
  } else {
    renderMessages([]);
  }
}

btnNewChatEl.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  currentSessionId = await createNewSession();
  const s = await loadSession(currentSessionId);
  renderMessages(s.messages);

  const recent = await loadRecentSessions();
  renderHistoryList(recent);
});

askFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const text = askInputEl.value.trim();
  if (!text) return;
  askInputEl.value = "";

  await handleSendMessage(text);
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
