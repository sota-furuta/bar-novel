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

// FAQ: 1つ開いたら他は閉じる
const faqItems = document.querySelectorAll(".faq-item");
faqItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    faqItems.forEach((other) => {
      if (other !== item && other.open) other.open = false;
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

// 外部リンク: 電話以外は外部サービスを開く前に確認する
(function () {
  const links = document.querySelectorAll('a[href^="http"]');
  if (!links.length) return;

  const modal = document.createElement("div");
  modal.className = "external-open-modal";
  modal.hidden = true;
  modal.innerHTML =
    '<div class="external-open-dialog" role="dialog" aria-modal="true" aria-labelledby="externalOpenMessage">' +
    '<p class="external-open-message" id="externalOpenMessage"></p>' +
    '<div class="external-open-actions">' +
    '<button type="button" class="external-open-cancel">キャンセル</button>' +
    '<button type="button" class="external-open-confirm">開く</button>' +
    "</div></div>";
  document.body.appendChild(modal);

  const message = modal.querySelector(".external-open-message");
  const cancelButton = modal.querySelector(".external-open-cancel");
  const confirmButton = modal.querySelector(".external-open-confirm");
  let pendingUrl = "";
  let lastFocused = null;

  const serviceName = (link) => {
    if (link.href.includes("instagram.com")) return "Instagram";
    if (link.href.includes("maps.app.goo.gl") || link.href.includes("google.com/maps")) return "Googleマップ";
    return link.textContent.trim();
  };

  const close = () => {
    modal.classList.remove("is-visible");
    document.body.classList.remove("external-open-locked");
    window.setTimeout(() => {
      modal.hidden = true;
      pendingUrl = "";
      if (lastFocused) lastFocused.focus();
    }, 180);
  };

  const open = (link) => {
    pendingUrl = link.href;
    lastFocused = link;
    message.textContent = `${serviceName(link)}を開きますか？`;
    modal.hidden = false;
    document.body.classList.add("external-open-locked");
    window.requestAnimationFrame(() => {
      modal.classList.add("is-visible");
      confirmButton.focus();
    });
  };

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open(link);
    });
  });

  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", () => {
    if (pendingUrl) window.open(pendingUrl, "_blank", "noopener");
    close();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) close();
  });
})();
