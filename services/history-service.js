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
  addDoc,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Helper: đường dẫn root của user hiện tại
function userRoot() {
  const user = auth.currentUser;
  if (!user) throw new Error("Chưa đăng nhập");
  return { uid: user.uid, colUsers: collection(db, "users") };
}

// Helper: ref doc user
function userDocRef(uid) {
  return doc(db, "users", uid);
}

// Helper: collection sessions
function sessionsColRef(uid) {
  return collection(db, "users", uid, "sessions");
}

// === Debug helper (log gọn) ===
function logError(ctx, err) {
  const msg = err?.message || String(err);
  console.error(`[Firestore:${ctx}]`, msg, err);
}

// ========= Tạo session mới =========
/**
 * Tạo session mới rỗng cho user hiện tại
 * @returns {Promise<string>} sessionId vừa tạo
 */
export async function createNewSession() {
  try {
    const { uid } = userRoot();

    // Đảm bảo doc user tồn tại (set rỗng nếu chưa có)
    const uref = userDocRef(uid);
    const usnap = await getDoc(uref);
    if (!usnap.exists()) {
      await setDoc(uref, { createdAt: serverTimestamp() }, { merge: true });
    }

    // Tạo session bằng addDoc để sinh id tự động (ổn định hơn crypto.randomUUID trong môi trường khoá rules)
    const col = sessionsColRef(uid);
    const newDoc = await addDoc(col, {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      title: "Cuộc trò chuyện mới",
      messages: [],
    });

    return newDoc.id;
  } catch (err) {
    logError("createNewSession", err);
    throw err;
  }
}

// ========= Ghi thêm message =========
/**
 * Ghi thêm 1 message vào session
 * @param {string} sessionId
 * @param {"user"|"ai"} role
 * @param {string} text
 */
export async function appendMessage(sessionId, role, text) {
  try {
    const { uid } = userRoot();

    const sref = doc(db, "users", uid, "sessions", sessionId);
    const ssnap = await getDoc(sref);

    // Nếu session chưa tồn tại (do rules/đường truyền), tự tạo lại
    if (!ssnap.exists()) {
      console.warn("appendMessage(): session chưa tồn tại, tạo mới:", sessionId);
      await setDoc(
        sref,
        {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          title: role === "user" ? (text.length > 80 ? text.slice(0, 80) + "..." : text) : "Cuộc trò chuyện mới",
          messages: [],
        },
        { merge: true }
      );
    }

    const data = (await getDoc(sref)).data() || {};
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

    // Cập nhật title nếu là câu hỏi đầu tiên
    if ((data.title === "Cuộc trò chuyện mới" || !data.title) && role === "user" && messages.length === 1) {
      newData.title = text.length > 80 ? text.slice(0, 80) + "..." : text;
    }

    await updateDoc(sref, newData);
  } catch (err) {
    logError("appendMessage", err);
    throw err;
  }
}

// ========= Lấy full nội dung 1 session =========
export async function loadSession(sessionId) {
  try {
    const { uid } = userRoot();

    const sref = doc(db, "users", uid, "sessions", sessionId);
    const snap = await getDoc(sref);
    if (!snap.exists()) {
      throw new Error("Session không tồn tại");
    }

    const data = snap.data();
    return {
      sessionId,
      title: data.title || "(Không tiêu đề)",
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  } catch (err) {
    logError("loadSession", err);
    throw err;
  }
}

// ========= Lấy danh sách session gần đây =========
export async function loadRecentSessions(maxItems = 10) {
  try {
    const { uid } = userRoot();

    const colRef = sessionsColRef(uid);
    const qy = query(colRef, orderBy("updatedAt", "desc"), limit(maxItems));
    const qSnap = await getDocs(qy);

    const result = [];
    qSnap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      result.push({
        sessionId: docSnap.id,
        title: d.title || "(Không tiêu đề)",
        updatedAt: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
      });
    });

    return result;
  } catch (err) {
    logError("loadRecentSessions", err);
    throw err;
  }
}
