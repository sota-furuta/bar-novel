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

// 臨時休業のお知らせ帯
(function () {
  const banner = document.getElementById("closureBanner");
  if (!banner) return;
  fetch("/api/news")
    .then((r) => r.json())
    .then((d) => {
      const list = (d && d.closures) || [];
      if (!list.length) return;
      const fmt = (c) => {
        const dt = new Date(c.date + "T00:00:00+09:00");
        const w = "日月火水木金土"[dt.getDay()];
        return `${dt.getMonth() + 1}月${dt.getDate()}日（${w}）は臨時休業です${c.note ? "（" + c.note + "）" : ""}`;
      };
      banner.textContent = "【お知らせ】" + list.slice(0, 2).map(fmt).join("／");
      banner.hidden = false;
      document.body.classList.add("has-banner");
      document.body.style.setProperty("--banner-h", banner.offsetHeight + "px");
    })
    .catch(() => {});
})();
