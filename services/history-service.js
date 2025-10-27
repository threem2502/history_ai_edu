// services/history-service.js
import { auth, db } from "../js/firebase-config.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/**
 * Tạo session mới rỗng cho user hiện tại
 * @returns {Promise<string>} sessionId vừa tạo
 */
export async function createNewSession() {
  const user = auth.currentUser;
  if (!user) throw new Error("Chưa đăng nhập");

  const sessionId = crypto.randomUUID();

  const ref = doc(db, "users", user.uid, "sessions", sessionId);
  await setDoc(ref, {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    title: "Cuộc trò chuyện mới",
    messages: [],
  });

  return sessionId;
}

/**
 * Ghi thêm 1 message vào session
 * @param {string} sessionId
 * @param {("user"|"ai")} role
 * @param {string} text
 */
export async function appendMessage(sessionId, role, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("Chưa đăng nhập");

  const ref = doc(db, "users", user.uid, "sessions", sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.warn("appendMessage() session không tồn tại:", sessionId);
    return;
  }

  const data = snap.data();
  const messages = Array.isArray(data.messages) ? data.messages.slice() : [];
  messages.push({
    role,
    text,
    ts: Date.now(),
  });

  const newData = {
    messages,
    updatedAt: serverTimestamp(),
  };

  if (
    data.title === "Cuộc trò chuyện mới" &&
    role === "user" &&
    messages.length === 1
  ) {
    newData.title = text.length > 80 ? text.slice(0, 80) + "..." : text;
  }

  await updateDoc(ref, newData);
}

/**
 * Lấy full nội dung 1 session
 */
export async function loadSession(sessionId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Chưa đăng nhập");

  const ref = doc(db, "users", user.uid, "sessions", sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Session không tồn tại");
  }

  const data = snap.data();
  return {
    sessionId,
    title: data.title,
    messages: data.messages || [],
  };
}

/**
 * Lấy danh sách session gần đây để hiển thị bên phải
 */
export async function loadRecentSessions(maxItems = 10) {
  const user = auth.currentUser;
  if (!user) throw new Error("Chưa đăng nhập");

  const colRef = collection(db, "users", user.uid, "sessions");
  const q = query(colRef, orderBy("updatedAt", "desc"), limit(maxItems));
  const qSnap = await getDocs(q);

  const result = [];
  qSnap.forEach((docSnap) => {
    const d = docSnap.data();
    result.push({
      sessionId: docSnap.id,
      title: d.title || "(Không tiêu đề)",
      updatedAt: d.updatedAt?.toMillis
        ? d.updatedAt.toMillis()
        : Date.now(),
    });
  });

  return result;
}
