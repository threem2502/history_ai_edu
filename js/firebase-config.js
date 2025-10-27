// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";

// --------------------- CONFIG ---------------------
const firebaseConfig = {
  apiKey: "AIzaSyC3R8mzTuwSJJ2Dc_XaULmhcZ5hd5GI_gA",
  authDomain: "ai-edu-5d02d.firebaseapp.com",
  projectId: "ai-edu-5d02d",
  storageBucket: "ai-edu-5d02d.firebasestorage.app",
  messagingSenderId: "883733697145",
  appId: "1:883733697145:web:b31453ac9a7b02f5c43aa8",
  measurementId: "G-CKYT3J6PVJ",
};

// --------------------- INIT APP ---------------------
export const app = initializeApp(firebaseConfig);

// Auth
export const auth = getAuth(app);
export { onAuthStateChanged }; // export hàm listener auth state

// Firestore
export const db = getFirestore(app);

// Analytics (không bắt buộc phải dùng trên localhost nhưng vẫn khởi tạo)
export const analytics = getAnalytics(app);
