// js/nav.js
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

function highlightActiveNavLink() {
  // đánh dấu link hiện tại là active dựa vào URL
  const path = window.location.pathname.split("/").pop() || "index.html";
  const links = document.querySelectorAll('[data-nav]');

  links.forEach(link => {
    const href = link.getAttribute("href");
    if (href === path) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

function setupNavbarAuthUI() {
  const loginBtn = document.getElementById("nav-login-btn");
  const userMenu = document.getElementById("nav-user-menu");
  const userEmailSpan = document.getElementById("nav-user-email");
  const logoutBtn = document.getElementById("nav-logout-btn");

  if (!loginBtn || !userMenu) {
    // navbar chưa inject xong => không làm gì
    return;
  }

  // Lắng nghe trạng thái đăng nhập Firebase
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // ĐÃ ĐĂNG NHẬP
      loginBtn.classList.add("d-none");
      userMenu.classList.remove("d-none");

      if (userEmailSpan) {
        userEmailSpan.textContent = user.displayName
          ? `${user.displayName}`
          : (user.email || "Người dùng");
      }
    } else {
      // CHƯA ĐĂNG NHẬP
      userMenu.classList.add("d-none");
      loginBtn.classList.remove("d-none");
    }
  });

  // Xử lý đăng xuất
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        // quay về trang chủ sau đăng xuất
        window.location.href = "index.html";
      } catch (err) {
        console.error("Logout error:", err);
        // có thể show toast sau này
      }
    });
  }
}

// Vì navbar được inject động bằng fetch(), ta cần chạy logic SAU khi navbar đã gắn vào DOM
// => ta export hàm để trang gọi sau khi fetch xong
export function initNavbarAfterInject() {
  highlightActiveNavLink();
  setupNavbarAuthUI();
}
