// services/study-assistant-history.js
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

function studyCol(uid) {
  // lịch sử riêng cho Study Assistant
  return collection(db, "users", uid, "study_sessions");
}

/** Tạo session mới cho Study Assistant */
export async function createNewStudySession(title = "Phiên học với PDF") {
  const uid = requireUser();

  // đảm bảo doc user tồn tại
  const uref = userDoc(uid);
  const usnap = await getDoc(uref);
  if (!usnap.exists()) {
    await setDoc(uref, { createdAt: serverTimestamp() }, { merge: true });
  }

  const col = studyCol(uid);
  const newDoc = await addDoc(col, {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    title,
    messages: [], // [{role, text, ts}]
    type: "study",
  });

  return newDoc.id;
}

/** Thêm message vào session Study */
export async function appendStudyMessage(sessionId, role, text, extra = {}) {
  const uid = requireUser();

  const sref = doc(db, "users", uid, "study_sessions", sessionId);
  const snap = await getDoc(sref);
  if (!snap.exists()) {
    await setDoc(
      sref,
      {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        title:
          role === "user"
            ? text?.slice(0, 80) || "Phiên học với PDF"
            : "Phiên học với PDF",
        messages: [],
        type: "study",
      },
      { merge: true }
    );
  }

  const cur = (await getDoc(sref)).data() || {};
  const messages = Array.isArray(cur.messages) ? cur.messages.slice() : [];
  messages.push({
    role,
    text,
    ts: Date.now(),
    ...extra,
  });

  const update = {
    messages,
    updatedAt: serverTimestamp(),
  };

  if ((!cur.title || cur.title === "Phiên học với PDF") &&
      role === "user" &&
      messages.length === 1) {
    update.title =
      text && text.length > 80 ? text.slice(0, 80) + "..." : text || "Phiên học với PDF";
  }

  await updateDoc(sref, update);
}

/** Lấy đầy đủ 1 session Study */
export async function loadStudySession(sessionId) {
  const uid = requireUser();
  const sref = doc(db, "users", uid, "study_sessions", sessionId);
  const snap = await getDoc(sref);
  if (!snap.exists()) throw new Error("Study session không tồn tại");
  const d = snap.data() || {};
  return {
    sessionId,
    title: d.title || "Phiên học với PDF",
    messages: Array.isArray(d.messages) ? d.messages : [],
  };
}

/** Lấy danh sách session Study gần đây */
export async function loadRecentStudySessions(maxItems = 10) {
  const uid = requireUser();
  const col = studyCol(uid);
  const qy = query(col, orderBy("updatedAt", "desc"), limit(maxItems));
  const qs = await getDocs(qy);

  const out = [];
  qs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    out.push({
      sessionId: docSnap.id,
      title: d.title || "Phiên học với PDF",
      updatedAt: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
    });
  });

  return out;
}
