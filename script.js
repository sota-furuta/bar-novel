// BAR NOVEL — pochi edition

// ヘッダー: スクロールで背景を濃くする
const header = document.getElementById("siteHeader");
const onScroll = () => {
  header.classList.toggle("is-scrolled", window.scrollY > 40);
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// メニュー: DRINK / FOOD タブ切り替え
const tabs = document.querySelectorAll(".menu-tab");
const panels = document.querySelectorAll(".menu-panel");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    panels.forEach((p) => {
      const active = p.dataset.panel === tab.dataset.tab;
      p.classList.toggle("is-active", active);
      p.hidden = !active;
    });
  });
});

// セクション: スクロールでふわっと表示
const revealTargets = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-shown");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add("is-shown"));
}

// ハンバーガーメニュー開閉
const hamburger = document.getElementById("hamburger");
const hamburgerMenu = document.getElementById("hamburgerMenu");
if (hamburger && hamburgerMenu) {
  const setMenu = (open) => {
    hamburger.classList.toggle("is-open", open);
    hamburger.setAttribute("aria-expanded", open ? "true" : "false");
    hamburgerMenu.hidden = !open;
  };
  hamburger.addEventListener("click", () => {
    setMenu(hamburgerMenu.hidden);
  });
  hamburgerMenu.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => setMenu(false));
  });
  document.addEventListener("click", (e) => {
    if (!hamburgerMenu.hidden && !e.target.closest(".site-header")) setMenu(false);
  });
}

// 営業中ステータス（火〜日 20:00〜翌04:00 / 月曜定休）
(function () {
  const badge = document.getElementById("openBadge");
  if (!badge) return;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const day = now.getDay(); // 0=日, 1=月
  const mins = now.getHours() * 60 + now.getMinutes();
  let open = false;
  let text;
  if (mins >= 20 * 60) {
    open = day !== 1;
    text = open ? "営業中です" : "本日は定休日です";
  } else if (mins < 4 * 60) {
    open = day !== 2; // 前日（営業開始日）が月曜なら閉店
    text = open ? "営業中です" : "営業時間外です";
  } else {
    text = day === 1 ? "本日は定休日です" : "本日 20:00 オープン";
  }
  badge.textContent = text;
  badge.classList.toggle("is-open", open);
  badge.hidden = false;
})();
