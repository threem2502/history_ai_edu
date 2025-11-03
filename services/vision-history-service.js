// services/vision-history-service.js
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

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error("Chưa đăng nhập");
  return user.uid;
}
function userDoc(uid) {
  return doc(db, "users", uid);
}
function visionCol(uid) {
  return collection(db, "users", uid, "vision_sessions");
}

/** Tạo session vision mới, trả về sessionId */
export async function createNewVisionSession(title = "Phân tích hình ảnh") {
  const uid = requireUser();

  const uref = userDoc(uid);
  const usnap = await getDoc(uref);
  if (!usnap.exists()) {
    await setDoc(uref, { createdAt: serverTimestamp() }, { merge: true });
  }

  const vsCol = visionCol(uid);
  const newDoc = await addDoc(vsCol, {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    title,
    messages: [], // [{role: "user"|"ai", text, ts}]
    type: "vision",
  });
  return newDoc.id;
}

/** Thêm message vào session vision */
export async function appendVisionMessage(sessionId, role, text, extra = {}) {
  const uid = requireUser();

  const sref = doc(db, "users", uid, "vision_sessions", sessionId);
  const snap = await getDoc(sref);
  if (!snap.exists()) {
    await setDoc(
      sref,
      {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        title: role === "user" ? (text?.slice(0, 80) || "Phân tích hình ảnh") : "Phân tích hình ảnh",
        messages: [],
        type: "vision",
      },
      { merge: true }
    );
  }

  const cur = (await getDoc(sref)).data() || {};
  const messages = Array.isArray(cur.messages) ? cur.messages.slice() : [];
  messages.push({ role, text, ts: Date.now(), ...extra });

  const update = {
    messages,
    updatedAt: serverTimestamp(),
  };
  if ((!cur.title || cur.title === "Phân tích hình ảnh") && role === "user" && messages.length === 1) {
    update.title = text?.length > 80 ? text.slice(0, 80) + "..." : text || "Phân tích hình ảnh";
  }
  await updateDoc(sref, update);
}

/** Lấy 1 session vision */
export async function loadVisionSession(sessionId) {
  const uid = requireUser();
  const sref = doc(db, "users", uid, "vision_sessions", sessionId);
  const snap = await getDoc(sref);
  if (!snap.exists()) throw new Error("Vision session không tồn tại");
  const d = snap.data() || {};
  return {
    sessionId,
    title: d.title || "Phân tích hình ảnh",
    messages: Array.isArray(d.messages) ? d.messages : [],
  };
}

/** Lấy danh sách session vision gần đây */
export async function loadRecentVisionSessions(maxItems = 10) {
  const uid = requireUser();
  const vsCol = visionCol(uid);
  const qy = query(vsCol, orderBy("updatedAt", "desc"), limit(maxItems));
  const qs = await getDocs(qy);

  const out = [];
  qs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    out.push({
      sessionId: docSnap.id,
      title: d.title || "Phân tích hình ảnh",
      updatedAt: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
    });
  });
  return out;
}
