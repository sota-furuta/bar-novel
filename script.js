// BAR NOVEL — pochi edition

// ヘッダー: スクロールで背景を濃くする
const header = document.getElementById("siteHeader");
const onScroll = () => {
  header.classList.toggle("is-scrolled", window.scrollY > 40);
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// 滑らかなスクロール（reduced-motion の場合は即時移動）
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollToY = (y) => window.scrollTo({ top: y, behavior: prefersReducedMotion() ? "auto" : "smooth" });

// 「スクロールが止まったら実行する」共通ヘルパー（デバウンスの一元化）。
// scroll のたびにタイマーを先送りし、最後のスクロールから delay ミリ秒止まったら
// callback を1回だけ実行する。スクロールが発生しない場合でも実行されるよう、
// 登録時点から最初のタイマーをかける（保険）。戻り値は取り消し関数で、呼ぶと
// リスナーとタイマーを解除して callback は実行されない（何度呼んでもよい）。
// スクロール停止判定の待ち時間（最後のスクロールからこの時間止まったら「止まった」とみなす）。
// チューニングするときはこの1か所だけを変更する。
const SCROLL_SETTLED_DELAY = 250;

const onScrollSettled = (callback, delay = SCROLL_SETTLED_DELAY) => {
  let timer = null;
  let active = true;
  const cleanup = () => {
    window.removeEventListener("scroll", postpone);
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const finish = () => {
    if (!active) return;
    active = false;
    cleanup();
    callback();
  };
  const postpone = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(finish, delay);
  };
  const cancel = () => {
    if (!active) return;
    active = false;
    cleanup();
  };
  window.addEventListener("scroll", postpone, { passive: true });
  timer = setTimeout(finish, delay);
  return cancel;
};

// スクロールスパイ共通ヘルパー: 帯域内にある要素を Set で保持し、
// 文書順（orderedEls の並び順）で最後のものを現在地として返す。
// 目次ハイライトとヘッダーナビの両スパイで共用する（entries の届く順には依存しない）
const createVisibleTracker = (orderedEls) => {
  const visible = new Set();
  return {
    update(entries) {
      entries.forEach((e) => {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      });
    },
    // 帯域内に要素が無ければ null、あれば文書順で最後の要素を返す
    last() {
      if (!visible.size) return null;
      const ordered = [...visible].sort((a, b) => orderedEls.indexOf(a) - orderedEls.indexOf(b));
      return ordered[ordered.length - 1];
    },
  };
};

// メニュー: DRINK / FOOD タブ切り替え
const tabs = document.querySelectorAll(".menu-tab");
const panels = document.querySelectorAll(".menu-panel");
const menuSection = document.getElementById("menu");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const menuTopBefore = menuSection ? menuSection.getBoundingClientRect().top + window.scrollY : 0;
    const relPos = window.scrollY - menuTopBefore;
    tabs.forEach((t) => {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    panels.forEach((p) => {
      const active = p.dataset.panel === tab.dataset.tab;
      p.classList.toggle("is-active", active);
      p.hidden = !active;
    });
    if (menuSection && relPos > 0) {
      const menuTopAfter = menuSection.getBoundingClientRect().top + window.scrollY;
      let y = menuTopAfter + relPos;
      const panel = document.querySelector(".menu-panel.is-active");
      if (panel) {
        const panelTopY = panel.getBoundingClientRect().top + window.scrollY;
        const panelBottomY = panelTopY + panel.offsetHeight;
        const header = document.querySelector(".site-header");
        const bEl = document.getElementById("closureBanner");
        const tabsEl = document.querySelector(".menu-tabs");
        const topOffset = (header ? header.offsetHeight : 0) + (bEl && !bEl.hidden ? bEl.offsetHeight : 0) + (tabsEl ? tabsEl.offsetHeight : 0) + 10;
        const minY = panelTopY - topOffset;
        const maxY = panelBottomY - window.innerHeight * 0.85;
        if (y > maxY) y = Math.max(minY, maxY);
      }
      window.scrollTo({ top: y, behavior: "auto" });
    }
  });
});

// ドリンク一覧: 価格や銘柄の変更は、ここの数字を直すだけでOK（ギャラリーとメニューの両方に自動で反映される）
// chip は目次チップの短縮表示名（見出しは cat の正式名称のまま）。カテゴリを追加・改名するときは、chip の付け忘れ・消し忘れに注意（例：Canadian and Irish → chip: "Canadian/Irish"）
const DRINK_LISTS = {
  cocktails: [
    { cat: "Gin base", items: [["ギムレット", 900], ["ネグローニ", 900], ["マティーニ", 950], ["ジントニック", 750], ["ニンジャタートル", 800]] },
    { cat: "Vodka base", items: [["カミカゼ", 900], ["ガルフストリーム", 900], ["スクリュードライバー", 800], ["ブラッディ・メアリー", 850], ["モスコーミュール", 750]] },
    { cat: "Rum base", items: [["エックスワイジィ", 900], ["キューバリブレ", 750], ["ダイキリ", 900], ["パイナップルフィズ", 750], ["ボストンクーラー", 750]] },
    { cat: "Tequila base", items: [["マルガリータ", 900], ["モッキンバード", 900], ["エルディアブロ", 800], ["テキーラサンライズ", 800], ["ストローハット", 850]] },
    { cat: "Whisky base", items: [["マンハッタン", 950], ["ゴッドファーザー", 850], ["ニューヨーク", 900], ["ラスティネイル", 900], ["チャーチル", 900]] },
    { cat: "Brandy base", items: [["サイドカー", 950], ["ジャックローズ", 900], ["アレキサンダー", 950], ["オリンピック", 950]] },
    { cat: "Liqueur base", items: [["チャイナブルー", 800], ["チャーリーチャップリン", 850], ["スプモーニ", 750], ["ピーチツリーフィズ", 750], ["カルーアミルク", 750]] },
    { cat: "Beer base", items: [["レッドアイ", 800], ["シャンディガフ", 800], ["ディーゼル", 800]] },
  ],
  whiskey: [
    { cat: "Scotch", items: [["グレンリベット12年", 850], ["グレンフィディック12年", 850], ["ジョニーウォーカー ダブルブラック", 850]] },
    { cat: "American", items: [["ジャックダニエル", 750], ["ワイルドターキー", 800], ["メーカーズマーク", 800], ["ウッドフォードリザーブ", 950]] },
    { cat: "Canadian and Irish", chip: "Canadian/Irish", items: [["カナディアンクラブ", 750], ["ジェムソン", 800], ["ブラックブッシュ", 850]] },
    { cat: "Japanese", items: [["オールド", 750]] },
    { cat: "Smoky", items: [["アードベック10年", 900], ["アードベック5年", 900], ["ラフロイグ10年", 1200]] },
  ],
  // spirits: 品数が増えたら目次の要否を再検討すること（判断と理由は利用側の目次条件の横のコメント参照）
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
  const catEls = [];
  const idxBtns = [];
  let idxEl = null;
  // 目次ハイライトの現在地表示（共通ヘルパーで帯域内の見出しを保持する）
  const visibleCats = createVisibleTracker(catEls);
  const setCurrent = (gi) => {
    idxBtns.forEach((b, bi) => {
      const current = bi === gi;
      b.classList.toggle("is-current", current);
      if (current) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
  };
  const applyFromVisible = () => {
    const lastCat = visibleCats.last();
    if (lastCat) {
      const gi = catEls.indexOf(lastCat);
      if (gi >= 0) { setCurrent(gi); return; }
    }
    // 帯域にどの見出しも入っていない間は、帯域（rootMargin -35% の上端）の直上に
    // ある直近の見出しを現在地とする。直上に見出しが無い（先頭より上を見ている）場合は
    // 先頭のカテゴリを現在地とする（デフォルトは先頭）。
    // 閉じている一覧の見出しはレイアウトが無いので数えない
    const bandTop = window.innerHeight * 0.35;
    let gi = -1;
    catEls.forEach((cat, i) => {
      if (cat.getClientRects().length && cat.getBoundingClientRect().top < bandTop) gi = i;
    });
    setCurrent(gi >= 0 ? gi : 0);
  };
  // チップタップ直後のハイライト固定：スクロール完了までObserverの更新を無視する
  let holdGi = null;
  let cancelHoldRelease = null;
  // 開いた直後の初期ハイライト（スクロール完了待ち）の保留を取り消すための受け口。
  // チップをタップしたら保留を取り消し、タップ先のハイライトを初期ハイライトで
  // 上書きしないようにする（保留側の実行が固定解除より後に来うるため、
  // holdGi の状態チェックでは防げない）
  let pendingInitial = null;
  // タップした見出しの着地位置（.drink-cat の scroll-margin-top の計算値を直接読む）
  const expectedRestTop = () => {
    const cat = catEls[holdGi];
    if (cat) {
      const v = parseFloat(window.getComputedStyle(cat).scrollMarginTop);
      if (Number.isFinite(v)) return v;
    }
    // 保険：CSS変数から同じ値を組み立てる（128px等の直書きはしない）
    const root = window.getComputedStyle(document.documentElement);
    const tabsH = parseFloat(root.getPropertyValue("--tabs-h")) || 76;
    const headH = parseFloat(root.getPropertyValue("--heading-h")) || 52;
    const h = document.querySelector(".site-header");
    const bEl = document.getElementById("closureBanner");
    return (h ? h.offsetHeight : 68) + (bEl && !bEl.hidden ? bEl.offsetHeight : 0) + tabsH + headH;
  };
  // 固定の解除は共通ヘルパー onScrollSettled に寄せる（スクロール中はヘルパー側が
  // タイマーを先送りし続けるため、scroll イベントから個別に再予約する必要はない）
  const scheduleHoldRelease = () => {
    if (cancelHoldRelease) cancelHoldRelease();
    cancelHoldRelease = onScrollSettled(() => {
      cancelHoldRelease = null;
      if (holdGi === null) return;
      const gi = holdGi;
      holdGi = null;
      // タップした見出しが着地位置から動いていたら（タップ後に手動でスクロールしていた場合）、
      // 帯域の集合からハイライトを再計算する
      const top = catEls[gi] ? catEls[gi].getBoundingClientRect().top : -1;
      if (Math.abs(top - expectedRestTop()) > 4) {
        applyFromVisible();
      } else {
        // スクロール完了：移動先のカテゴリ見出しへフォーカスを移す（スクリーンリーダー向け）。
        // preventScroll でフォーカス自体による余計なスクロールを起こさない
        if (catEls[gi]) catEls[gi].focus({ preventScroll: true });
      }
    });
  };
  if (["cocktails", "whiskey"].includes(box.dataset.menuList) && box.closest(".drink-detail") && groups.length > 3) { // スピリッツは6品のみで一覧が短いため目次を付けない（意図的に除外）
    // 目次チップの上に小さな案内ラベルを付ける（チップの役割を初めて見る人にも伝える）
    const idxLabel = document.createElement("p");
    idxLabel.className = "drink-index-label";
    idxLabel.id = "drink-index-label-" + box.dataset.menuList;
    idxLabel.textContent = box.dataset.menuList === "whiskey" ? "種類から探す" : "ベースから探す";
    const idx = document.createElement("div");
    idx.className = "drink-index";
    idx.setAttribute("role", "group");
    idx.setAttribute("aria-labelledby", idxLabel.id);
    idxEl = idx;
    groups.forEach((group, gi) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "drink-index-btn";
      // chip があるカテゴリは目次チップだけ短縮表示にする（見出しは正式名称のまま）。
      // 読み上げでは正式名称が分かるよう aria-label に正式名称を入れる
      b.textContent = group.chip || group.cat.replace(" base", "");
      if (group.chip) b.setAttribute("aria-label", group.cat);
      b.addEventListener("click", () => {
        if (!catEls[gi]) return;
        // 保留中の初期ハイライトがあれば取り消す（タップ先を先頭で上書きしない）
        if (pendingInitial) pendingInitial();
        holdGi = gi;
        setCurrent(gi);
        scheduleHoldRelease();
        catEls[gi].scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      });
      idxBtns.push(b);
      idx.appendChild(b);
    });
    box.appendChild(idxLabel);
    box.appendChild(idx);
  }
  groups.forEach((group) => {
    const cat = document.createElement("p");
    cat.className = "drink-cat";
    cat.textContent = group.cat;
    // 目次チップからの移動先としてフォーカス可能にする（タブ移動の対象にはならない）
    cat.tabIndex = -1;
    catEls.push(cat);
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
      p.textContent = "¥" + price.toLocaleString("ja-JP");
      row.append(n, d, p);
      box.appendChild(row);
    });
  });
  const note = document.createElement("p");
  note.className = "drink-list-note";
  note.textContent = "※ 価格は税込です。";
  box.appendChild(note);
  // カクテル目次: 現在表示中のベースのチップをハイライトする（ヘッダーナビの現在地表示と同じ方式）
  if (idxEl && idxBtns.length && "IntersectionObserver" in window) {
    const tocSpy = new IntersectionObserver(
      (entries) => {
        visibleCats.update(entries);
        // タップ直後の固定中は、帯域に入った次の見出しで上書きしない
        if (holdGi !== null) return;
        applyFromVisible();
      },
      { rootMargin: "-35% 0px -55% 0px" }
    );
    catEls.forEach((cat) => tocSpy.observe(cat));
    // 固定の解除を先送りする処理は scheduleHoldRelease 側の共通ヘルパーが担う
    // （ヘルパーが scroll を監視してタイマーを先送りするため、ここでの個別登録は不要）
  }
  // 一覧を開いた直後に、表示中のカテゴリを初期ハイライトする
  const detailEl = box.closest(".drink-detail");
  if (idxEl && detailEl) {
    const highlightOnOpen = () => {
      if (!detailEl.open) return;
      // 開いた直後のデフォルトは先頭のカテゴリ（位置からの推定で末尾が残ることがあったため、
      // 推定はやめて先頭に決める。スクロールに合わせた切り替えは Observer 側が担う）
      setCurrent(0);
    };
    detailEl.addEventListener("toggle", () => {
      if (!detailEl.open) return;
      // 前回の保留が残っていたら取り消す（保留は常に1つだけにする）
      if (pendingInitial) pendingInitial();
      // 初期ハイライトは固定待ち（60ms）ではなく、開いた直後の自動スクロール
      // （makeExclusive 側の scrollToY）が完了してから行う。共通ヘルパー
      // onScrollSettled がスクロール中はタイマーを先送りし、止まってから実行する
      // （チップの固定解除と同じヘルパー）。スクロールが発生しない場合（既に着地
      // 位置にいる／reduced-motion で即時移動した場合）でも、ヘルパーの最初の
      // タイマーが保険になって実行される。
      // 途中で閉じた場合は highlightOnOpen 側の open チェックで何もしない。
      // pendingInitial にはヘルパーの取り消し関数が入る（チップタップ時に呼ぶ受け口）
      pendingInitial = onScrollSettled(() => {
        pendingInitial = null;
        highlightOnOpen();
      });
    });
  }
});
// 一覧を閉じたら、概要のカテゴリ位置まで戻る
function scrollToCategory(detail) {
  const li = detail.closest("li") || detail;
  const header = document.querySelector(".site-header");
  const bEl = document.getElementById("closureBanner");
  const tabsEl = document.querySelector(".menu-tabs");
          const offset = (header ? header.offsetHeight : 0) + (bEl && !bEl.hidden ? bEl.offsetHeight : 0) + (tabsEl ? tabsEl.offsetHeight : 0) + 10;
  const y = li.getBoundingClientRect().top + window.scrollY - offset;
  scrollToY(y);
}
// カテゴリの「¥○○〜」表記も、データの最安値から自動で合わせる
document.querySelectorAll("[data-menu-min]").forEach((el) => {
  const groups = DRINK_LISTS[el.dataset.menuMin] || [];
  const prices = groups.flatMap((g) => g.items.map((i) => i[1]));
  if (prices.length) el.textContent = "¥" + Math.min(...prices).toLocaleString("ja-JP") + "〜";
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
          const tabsEl = document.querySelector(".menu-tabs");
          const offset = (header ? header.offsetHeight : 0) + (bEl && !bEl.hidden ? bEl.offsetHeight : 0) + (tabsEl ? tabsEl.offsetHeight : 0) + 10;
          const y = target.getBoundingClientRect().top + window.scrollY - offset;
          scrollToY(y);
        }, 0);
      }
    });
  });
}
makeExclusive(".faq-item", false);
makeExclusive(".drink-detail", true);
// ドリンク一覧の開閉ラベル: 開いたら「閉じる」に切り替える
document.querySelectorAll(".drink-detail").forEach((item) => {
  const summary = item.querySelector("summary");
  if (!summary) return;
  const label = summary.textContent.trim();
  let closingBySummary = false;
  summary.addEventListener("click", () => {
    closingBySummary = item.open;
  });
  item.addEventListener("toggle", () => {
    summary.textContent = item.open ? label.replace("見る", "閉じる") : label;
    if (!item.open && closingBySummary) {
      closingBySummary = false;
      scrollToCategory(item);
    }
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
    '<button type="button" class="external-open-confirm">新しいタブで開く</button>' +
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

// ギャラリーのマウスドラッグ横スクロール（PC向け。タッチは標準スワイプのまま）
(function () {
  var track = document.getElementById("galleryTrack");
  if (!track) return;
  var down = false, moved = false, startX = 0, startScroll = 0;
  track.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse") return;
    down = true; moved = false;
    startX = e.clientX; startScroll = track.scrollLeft;
    e.preventDefault();
  });
  track.addEventListener("pointermove", function (e) {
    if (!down) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    if (moved) track.scrollLeft = startScroll - dx;
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) {
    track.addEventListener(t, function () { down = false; });
  });
  track.addEventListener("click", function (e) {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
  }, true);
})();

// ヘッダーナビ: 表示中のセクションを現在地として示す
(function () {
  const links = document.querySelectorAll('.header-nav a[href^="#"]');
  if (!links.length || !("IntersectionObserver" in window)) return;
  const byId = {};
  links.forEach((a) => { byId[a.getAttribute("href").slice(1)] = a; });
  const sections = ["concept", "menu", "gallery", "info", "faq", "access"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  // 目次ハイライトと同じ共通ヘルパーで帯域内にあるセクションを保持し、
  // 文書順で最後のものを現在地とする（entries の届く順には依存しない）
  const visibleSections = createVisibleTracker(sections);
  const applyFromVisible = () => {
    const current = visibleSections.last();
    if (!current) return;
    links.forEach((a) => {
      const isCurrent = a === byId[current.id];
      a.classList.toggle("is-current", isCurrent);
      if (isCurrent) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  };
  const spy = new IntersectionObserver((entries) => {
    visibleSections.update(entries);
    applyFromVisible();
  }, { rootMargin: "-35% 0px -55% 0px" });
  sections.forEach((s) => spy.observe(s));
})();
