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

// State cho giả stream
let currentAiBubble = null;
let typeTimer = null;
let fullText = "";       // toàn bộ câu trả lời
let shown = 0;           // số ký tự đã hiển thị
let baseStep = 2;        // tốc độ cơ bản
let intervalMs = 28;     // khoảng thời gian tick
let textEl = null;       // <pre> hiển thị raw khi đang "gõ"
let lastQuestionText = "";
let stoppedManually = false; // có bấm Dừng hay không

function renderMarkdownSafe(md) {
  const html = marked.parse(md);
  return window.DOMPurify ? DOMPurify.sanitize(html) : html;
}

/** Hiển thị danh sách tin nhắn (khi mở session) */
function renderMessages(messages, { append = false } = {}) {
  if (!messages || messages.length === 0) {
    chatMessagesEl.innerHTML = `
      <div class="text-center text-muted small mt-5">
        Chưa có tin nhắn nào. Hãy đặt câu hỏi đầu tiên 👇
      </div>
    `;
    return;
  }
  if (!append) chatMessagesEl.innerHTML = "";

  for (const m of messages) {
    const row = document.createElement("div");
    row.className = "chat-bubble-row mb-3";

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${m.role === "user" ? "bubble-user" : "bubble-ai"}`;

    if (m.role === "ai") {
      bubble.innerHTML = renderMarkdownSafe(m.text || "");
    } else {
      bubble.textContent = m.text || "";
    }

    row.appendChild(bubble);
    chatMessagesEl.appendChild(row);
  }
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

/** Render 1 message */
function renderSingleMessage(message) {
  const row = document.createElement("div");
  row.className = "chat-bubble-row mb-3";

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${message.role === "user" ? "bubble-user" : "bubble-ai"}`;

  if (message.role === "ai") {
    bubble.innerHTML = renderMarkdownSafe(message.text || "");
  } else {
    bubble.textContent = message.text || "";
  }

  row.appendChild(bubble);
  chatMessagesEl.appendChild(row);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

/** Danh sách lịch sử bên phải */
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
      <div class="small text-muted">${new Date(s.updatedAt).toLocaleString("vi-VN")}</div>
    `;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleOpenSession(s.sessionId);
    });

    historyListEl.appendChild(btn);
  });
}

/** Bắt đầu "gõ chữ" từ fullText vào <pre> */
function startFakeStream() {
  if (!textEl) return;
  stopFakeStream(false); // clear trước

  stoppedManually = false;
  typeTimer = setInterval(() => {
    const remain = fullText.length - shown;
    const step =
      remain > 1000 ? 24 :
      remain > 500  ? 12 :
      remain > 200  ? 6  :
      remain > 50   ? 3  : baseStep;

    shown = Math.min(fullText.length, shown + step);
    const partial = fullText.slice(0, shown);

    // Trong lúc "gõ" hiển thị raw để giữ nguyên xuống dòng
    textEl.textContent = partial;
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

    if (shown >= fullText.length) {
      stopFakeStream(false);
    }
  }, intervalMs);
}

/** Kết thúc "gõ"; nếu flushMarkdown=true thì convert sang markdown */
function stopFakeStream(flushMarkdown = true) {
  if (typeTimer) {
    clearInterval(typeTimer);
    typeTimer = null;
  }
  if (textEl) {
    if (flushMarkdown) {
      const html = renderMarkdownSafe(fullText);
      textEl.outerHTML = `<span class="ai-stream-text">${html}</span>`;
      textEl = null;
    } else {
      // giữ nguyên raw
      textEl.textContent = fullText;
    }
  }
}

/** Tạo bubble AI kèm nút Dừng/Gửi lại, trả về {bubble, stopBtn, regenBtn, rawEl} */
function createAiTypingBubble() {
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
      <pre class="ai-stream-raw m-0" style="white-space:pre-wrap;word-wrap:break-word;"></pre>
      <span class="d-inline-block align-middle ms-2 spinner-border spinner-border-sm text-secondary" role="status"></span>
    </div>
  `;

  row.appendChild(bubble);
  chatMessagesEl.appendChild(row);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

  return {
    row,
    bubble,
    stopBtn: row.querySelector(".btn-stop"),
    regenBtn: row.querySelector(".btn-regenerate"),
    rawEl: row.querySelector(".ai-stream-raw"),
  };
}

/** Đảm bảo có session hiện tại */
async function ensureSession() {
  if (!currentSessionId) {
    currentSessionId = await createNewSession();
  }
}

/** Gửi câu hỏi, nhận full text, rồi giả stream */
async function handleSendMessage(questionText) {
  if (isSending) return;
  isSending = true;

  // dọn state
  if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
  textEl = null;
  fullText = "";
  shown = 0;

  await ensureSession();
  lastQuestionText = questionText;

  // hiển thị câu hỏi của user ngay
  renderSingleMessage({ role: "user", text: questionText });

  // tạo bubble AI
  const { bubble, stopBtn, regenBtn, rawEl } = createAiTypingBubble();
  currentAiBubble = bubble.parentElement;
  textEl = rawEl;

  // gọi backend non-stream
  const { ok, answer, error } = await askGemini(questionText);

  // nếu lỗi: hiện lỗi + cho phép gửi lại
  if (!ok) {
    bubble.classList.remove("typing");
    const spinner = currentAiBubble.querySelector(".spinner-border");
    if (spinner) spinner.remove();
    stopBtn.remove();
    regenBtn.disabled = false;
    textEl.outerHTML = `<span class="ai-stream-text text-danger">[LỖI] ${error || "Không thể lấy câu trả lời."}</span>`;
    isSending = false;
    return;
  }

  // có answer → giả stream
  fullText = String(answer || "").trim();
  shown = 0;
  startFakeStream();

  // nút Dừng: dừng gõ + render markdown ngay, cho phép gửi lại
  stopBtn.addEventListener(
    "click",
    () => {
      stoppedManually = true;
      stopFakeStream(true); // chuyển sang markdown
      bubble.classList.remove("typing");
      const spinner = currentAiBubble.querySelector(".spinner-border");
      if (spinner) spinner.remove();
      stopBtn.remove();
      regenBtn.disabled = false;

      // Lưu vào Firestore (user + ai)
      (async () => {
        await appendMessage(currentSessionId, "user", lastQuestionText);
        await appendMessage(currentSessionId, "ai", fullText);
        const recent = await loadRecentSessions();
        renderHistoryList(recent);
      })();

      isSending = false;
    },
    { once: true }
  );

  // tick “hoàn tất tự nhiên”: polling xem đã gõ xong chưa
  const finishWatcher = setInterval(async () => {
    const spinner = currentAiBubble?.querySelector(".spinner-border");
    const isFinished = shown >= fullText.length;
    if (isFinished) {
      clearInterval(finishWatcher);
      // đổi sang markdown đẹp
      stopFakeStream(true);
      bubble.classList.remove("typing");
      if (spinner) spinner.remove();
      stopBtn.remove();
      regenBtn.disabled = false;

      // Lưu Firestore
      await appendMessage(currentSessionId, "user", lastQuestionText);
      await appendMessage(currentSessionId, "ai", fullText);
      const recent = await loadRecentSessions();
      renderHistoryList(recent);

      isSending = false;
    }
  }, 120);

  // Gửi lại (regenerate) → hỏi lại cùng câu hỏi
  regenBtn.addEventListener(
    "click",
    async () => {
      if (isSending) return;
      await handleSendMessage(lastQuestionText);
    },
    { once: true }
  );
}

/** Mở lại 1 session */
async function handleOpenSession(sessionId) {
  currentSessionId = sessionId;
  const s = await loadSession(sessionId);
  renderMessages(s.messages);
}

/** Khởi tạo trang sau đăng nhập */
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

/** New chat */
btnNewChatEl.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  currentSessionId = await createNewSession();
  const s = await loadSession(currentSessionId);
  renderMessages(s.messages);
  const recent = await loadRecentSessions();
  renderHistoryList(recent);
});

/** Enter để gửi; Shift+Enter xuống dòng */
askInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askFormEl.requestSubmit();
  }
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