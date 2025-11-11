// js/auth.js
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

// ------------------ HELPER ------------------
const goToApp = () => {
  // Sau khi đăng nhập/đăng ký xong → vào luôn trang chat-ai
  window.location.href = "chat-ai.html";
};

const showError = (id, message) => {
  const el = document.getElementById(id);
  if (el) el.textContent = message || "";
};

// ------------------ ĐĂNG KÝ ------------------
async function handleSignUp(e) {
  e.preventDefault();
  showError("signUpError", "");

  const fullName = document.getElementById("signUpFullName").value.trim();
  const email = document.getElementById("signUpEmail").value.trim();
  const password = document.getElementById("signUpPassword").value;
  const confirm = document.getElementById("signUpPasswordConfirm").value;

  if (!fullName) {
    showError("signUpError", "Vui lòng nhập họ và tên.");
    return;
  }
  if (password !== confirm) {
    showError("signUpError", "Mật khẩu nhập lại không khớp.");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: fullName });
    goToApp();
  } catch (error) {
    console.error(error);
    switch (error.code) {
      case "auth/email-already-in-use":
        showError("signUpError", "Email này đã được đăng ký.");
        break;
      case "auth/invalid-email":
        showError("signUpError", "Email không hợp lệ.");
        break;
      case "auth/weak-password":
        showError("signUpError", "Mật khẩu quá yếu (tối thiểu 6 ký tự).");
        break;
      default:
        showError("signUpError", "Đăng ký thất bại. Vui lòng thử lại.");
    }
  }
}

// ------------------ ĐĂNG NHẬP ------------------
async function handleSignIn(e) {
  e.preventDefault();
  showError("signInError", "");

  const email = document.getElementById("signInEmail").value.trim();
  const password = document.getElementById("signInPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    goToApp();
  } catch (error) {
    console.error(error);
    switch (error.code) {
      case "auth/user-not-found":
        showError("signInError", "Tài khoản không tồn tại.");
        break;
      case "auth/wrong-password":
        showError("signInError", "Sai mật khẩu.");
        break;
      case "auth/invalid-email":
        showError("signInError", "Email không hợp lệ.");
        break;
      default:
        showError("signInError", "Không thể đăng nhập. Vui lòng thử lại.");
    }
  }
}

// ------------------ GOOGLE LOGIN ------------------
async function handleGoogleLogin() {
  showError("signInError", "");
  showError("signUpError", "");
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    goToApp();
  } catch (error) {
    console.error(error);
    showError("signInError", "Không thể đăng nhập bằng Google.");
  }
}

// ------------------ INIT EVENT ------------------
document.addEventListener("DOMContentLoaded", () => {
  const signInForm = document.getElementById("signInForm");
  const signUpForm = document.getElementById("signUpForm");
  const googleBtn = document.getElementById("googleLoginBtn");

  if (signInForm) signInForm.addEventListener("submit", handleSignIn);
  if (signUpForm) signUpForm.addEventListener("submit", handleSignUp);
  if (googleBtn) googleBtn.addEventListener("click", handleGoogleLogin);

  // Nếu đã đăng nhập thì chuyển hướng khỏi trang auth
  onAuthStateChanged(auth, (user) => {
    if (user) goToApp();
  });
});
