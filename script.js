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

// ドリンク一覧: 価格や銘柄の変更は、ここの数字を直すだけでOK（ギャラリーとメニューの両方に自動で反映される）
const DRINK_LISTS = {
  cocktails: [
    { cat: "Gin base", items: [["ギムレット", 900], ["ネグローニ", 900], ["マティーニ", 950], ["ジントニック", 750], ["ニンジャタートル", 800]] },
    { cat: "Vodka base", items: [["カミカゼ", 900], ["ガルフストリーム", 900], ["スクリュードライバー", 800], ["ブラッディ・メアリー", 850], ["モスコーミュール", 750]] },
    { cat: "Rum base", items: [["エックスワイジィ", 900], ["キューバリブレ", 750], ["ダイキリ", 900], ["パイナップルフィズ", 750], ["ボストンクーラー", 750]] },
    { cat: "Tequila base", items: [["マルガリータ", 900], ["モッキンバード", 900], ["エルディアブロ", 800], ["テキーラサンライズ", 800], ["ストローハット", 850]] },
    { cat: "Whisky base", items: [["マンハッタン", 950], ["ゴッドファーザー", 850], ["ニューヨーク", 900], ["ラスティネイル", 900], ["チャーチル", 900]] },
    { cat: "Brandy base", items: [["サイドカー", 950], ["ジャックローズ", 900], ["アレキサンダー", 950], ["オリンピック", 950]] },
    { cat: "Liqueur base", items: [["チャイナブルー", 800], ["チャーリーチャップリン", 850], ["スプモーニ", 750], ["ピーチツリーフィズ", 750], ["カルーアミルク", 750]] },
    { cat: "Beer base", items: [["レッドアイ", 800], ["ジャンディガフ", 800], ["ディーゼル", 800]] },
  ],
  whiskey: [
    { cat: "Scotch", items: [["グレンリベット12年", 850], ["グレンフィディック12年", 850], ["ジョニーウォーカー ダブルブラック", 850]] },
    { cat: "American", items: [["ジャックダニエル", 750], ["ワイルドターキー", 800], ["メーカーズマーク", 800], ["ウッドフォードリザーブ", 950]] },
    { cat: "Canadian and Irish", items: [["カナディアンクラブ", 750], ["ジェムソン", 800], ["ブラックブッシュ", 850]] },
    { cat: "Japanese", items: [["オールド", 750]] },
    { cat: "Smoky", items: [["アードベック10年", 900], ["アードベック5年", 900], ["ラフロイグ10年", 1200]] },
  ],
  spirits: [
    { cat: "Gin", items: [["ボンベイサファイヤ", 850], ["タンカレーNo.10", 900]] },
    { cat: "Vodka", items: [["ズブロッカ", 800]] },
    { cat: "Rum", items: [["キャプテンモルガン", 800], ["マイヤーズ", 800]] },
    { cat: "Tequila", items: [["クエルボゴールド", 500]] },
  ],
  nonalcohol: [
    { cat: "Soft drink", items: [["コカコーラ", 550], ["ジンジャエール", 550], ["トマトジュース", 550], ["オレンジジュース", 550], ["パイナップルジュース", 550], ["クランベリージュース", 600], ["グレープフルーツジュース", 600], ["緑茶", 550], ["烏龍茶", 550], ["紅茶", 550], ["コーヒー", 550]] },
    { cat: "Non alcohol cocktail", items: [["シャーリーテンプル", 650], ["シンデレラ", 650], ["バージンブリーズ", 650]] },
  ],
};
document.querySelectorAll("[data-menu-list]").forEach((box) => {
  const groups = DRINK_LISTS[box.dataset.menuList] || [];
  groups.forEach((group) => {
    const cat = document.createElement("p");
    cat.className = "drink-cat";
    cat.textContent = group.cat;
    box.appendChild(cat);
    group.items.forEach(([name, price]) => {
      const row = document.createElement("div");
      row.className = "drink-row";
      const n = document.createElement("span");
      n.textContent = name;
      const d = document.createElement("span");
      d.className = "menu-dots";
      const p = document.createElement("span");
      p.className = "drink-price";
      p.textContent = "¥" + price;
      row.append(n, d, p);
      box.appendChild(row);
    });
  });
});
// カテゴリの「¥○○〜」表記も、データの最安値から自動で合わせる
document.querySelectorAll("[data-menu-min]").forEach((el) => {
  const groups = DRINK_LISTS[el.dataset.menuMin] || [];
  const prices = groups.flatMap((g) => g.items.map((i) => i[1]));
  if (prices.length) el.textContent = "¥" + Math.min(...prices) + "〜";
});

// 開閉パネル: 同じグループ内で1つ開いたら他は閉じる（FAQとドリンク一覧）
function makeExclusive(selector, scrollOnOpen) {
  const items = document.querySelectorAll(selector);
  items.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      items.forEach((other) => {
        if (other !== item && other.open) other.open = false;
      });
      if (scrollOnOpen) {
        const target = item.closest("li") || item;
        setTimeout(() => {
          const header = document.querySelector(".site-header");
          const bEl = document.getElementById("closureBanner");
          const offset = (header ? header.offsetHeight : 0) + (bEl && !bEl.hidden ? bEl.offsetHeight : 0) + 10;
          const y = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top: y, behavior: "smooth" });
        }, 400);
      }
    });
  });
}
makeExclusive(".faq-item", false);
makeExclusive(".drink-detail", true);

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
  const headerEl = document.querySelector(".site-header");
  const setHeaderH = () => {
    if (headerEl) document.body.style.setProperty("--header-h", headerEl.offsetHeight + "px");
  };
  setHeaderH();
  window.addEventListener("resize", setHeaderH);
  const fmt = (c) => {
    const dt = new Date(c.date + "T00:00:00+09:00");
    const w = "日月火水木金土"[dt.getDay()];
    return `${dt.getMonth() + 1}月${dt.getDate()}日（${w}）は臨時休業です${c.note ? "（" + c.note + "）" : ""}`;
  };
  Promise.all([
    fetch("/api/news").then((r) => r.json()).catch(() => ({})),
    fetch("/api/notices").then((r) => r.json()).catch(() => ({})),
  ])
    .then(([news, noticesData]) => {
      const items = [];
      ((news && news.closures) || []).slice(0, 2).forEach((c) => items.push(fmt(c)));
      ((noticesData && noticesData.notices) || []).forEach((n) => items.push(n.text));
      if (!items.length) return;
      banner.textContent = "【お知らせ】" + items.slice(0, 3).join("／");
      banner.hidden = false;
      document.body.classList.add("has-banner");
      document.body.style.setProperty("--banner-h", banner.offsetHeight + "px");
    })
    .catch(() => {});
})();

// ギャラリー: 管理画面から投稿された写真を、固定写真の後ろ・メニューカードの前に追加
(function () {
  const track = document.getElementById("galleryTrack");
  if (!track) return;
  fetch("/api/photos")
    .then((r) => r.json())
    .then((d) => {
      const list = (d && d.photos) || [];
      if (!list.length) return;
      const card = track.querySelector(".drink-card");
      const anchor = card ? card.closest(".gallery-item") : null;
      list.forEach((p) => {
        const fig = document.createElement("figure");
        fig.className = "gallery-item";
        const img = document.createElement("img");
        img.src = "/api/photo/" + p.id;
        img.alt = p.caption || "投稿写真";
        img.loading = "lazy";
        const cap = document.createElement("figcaption");
        cap.textContent = p.caption || "投稿写真";
        fig.appendChild(img);
        fig.appendChild(cap);
        track.insertBefore(fig, anchor);
      });
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

// ===== CTAタップ計測（管理画面の統計用） =====
(() => {
  const send = (type) => {
    try {
      const body = JSON.stringify({ type });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch (e) { /* 計測の失敗は無視する */ }
  };
  const classify = (a) => {
    const href = a.getAttribute("href") || "";
    if (href.indexOf("tel:") === 0) return "tel";
    if (href.indexOf("instagram.com") !== -1) return "instagram";
    if (href.indexOf("maps.app.goo.gl") !== -1 || href.indexOf("google.com/maps") !== -1 || href.indexOf("maps.google") !== -1) return "map";
    return null;
  };
  document.querySelectorAll("a[href]").forEach((a) => {
    const type = classify(a);
    if (type) a.addEventListener("click", () => send(type));
  });
})();
