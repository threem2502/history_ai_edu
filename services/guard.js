import { auth } from "../js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // chưa login -> đưa về trang đăng nhập
    window.location.href = "auth.html";
  }
});
