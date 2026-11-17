/* 임장메이트 성과 대시보드 (제작자 전용) */
(function () {
  var C = window.IMJANG_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var DEMO = params.get("demo") === "1";

  var state = { raw: null, config: { ads: [], kpi: {} }, key: "" };
  var DEFAULT_KPI = { signup: 10, purchase: 5, adSignup: 8 };

  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n(v) { return Number(v || 0).toLocaleString("ko-KR"); }
  function won(v) { return v == null || !isFinite(v) ? "–" : Math.round(v).toLocaleString("ko-KR") + "원"; }
  function pct(a, b, d) { return b ? (a / b * 100).toFixed(d == null ? 1 : d) + "%" : "–"; }
  function num(v) { var x = Number(String(v || "").replace(/[^\d.]/g, "")); return isFinite(x) ? x : 0; }

  // ---------------- 통신 ----------------
  function call(action, extra) {
    var body = { action: action, key: state.key };
    for (var k in extra) body[k] = extra[k];
    return fetch(C.ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function load() {
    if (DEMO) { state.raw = demoData(); afterLoad(); return Promise.resolve(); }
    $("updated").textContent = "불러오는 중…";
    return call("dashboard").then(function (res) {
      if (!res.ok) {
        if (res.error === "unauthorized") { logout(); $("login-error").textContent = "비밀번호가 맞지 않아요."; return; }
        throw new Error(res.error);
      }
      state.raw = res;
      afterLoad();
    }).catch(function (e) {
      $("updated").textContent = "불러오기 실패: " + e.message;
    });
  }

  function afterLoad() {
    var cfg = state.raw.config || {};
    state.config = { ads: cfg.ads || [], kpi: Object.assign({}, DEFAULT_KPI, cfg.kpi || {}), convBasis: cfg.convBasis || "signup" };
    $("conv-basis").value = state.config.convBasis;
    $("updated").textContent = "업데이트 " + new Date(state.raw.generatedAt).toLocaleString("ko-KR");
    showDash();
    render();
  }

  // ---------------- 로그인 ----------------
  function showLogin() { $("login-view").hidden = false; $("dash-view").hidden = true; $("no-endpoint").hidden = !!C.ENDPOINT; }
  function showDash() { $("login-view").hidden = true; $("dash-view").hidden = false; $("demo-banner").hidden = !DEMO; }
  function logout() { ss("im_admin_key", null); state.key = ""; showLogin(); }

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    $("login-error").textContent = "";
    if (!C.ENDPOINT) { $("login-error").textContent = "config.js 에 ENDPOINT를 먼저 넣어 주세요."; return; }
    state.key = $("admin-key").value;
    ss("im_admin_key", state.key);
    try { localStorage.setItem("im_internal", "1"); } catch (err) {} // 이 브라우저의 랜딩 방문은 팀원 접속으로 표시
    load();
  });
  $("logout").addEventListener("click", logout);
  $("refresh").addEventListener("click", load);
  $("range").addEventListener("change", render);
  $("excl-internal").addEventListener("change", render);
  $("mask").addEventListener("change", render);
  $("conv-basis").addEventListener("change", function () { state.config.convBasis = this.value; renderAds(filtered()); });

  // ---------------- 필터 ----------------
  function filtered() {
    var range = $("range").value;
    var excl = $("excl-internal").checked;
    var since = 0;
    if (range !== "all") {
      var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (Number(range) - 1)); since = d.getTime();
    }
    function ok(r) {
      if (excl && String(r.internal) === "1") return false;
      if (since && new Date(r.ts).getTime() < since) return false;
      return true;
    }
    return { events: state.raw.events.filter(ok), signups: state.raw.signups.filter(ok) };
  }

  function uniq(arr, fn) { var s = {}; arr.forEach(function (x) { s[fn(x)] = 1; }); return Object.keys(s).length; }
  function dedupSignups(list) {
    var seen = {}, out = [];
    list.forEach(function (s) { var k = String(s.contact).replace(/[\s-]/g, "").toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(s); } });
    return out;
  }
  // 방문자당 상품별 1회만 매출로 인정
  function purchases(events) {
    var seen = {}, out = [];
    events.forEach(function (e) {
      if (e.type !== "purchase_intent") return;
      var k = e.visitor_id + "|" + e.label;
      if (!seen[k]) { seen[k] = 1; out.push(e); }
    });
    return out;
  }
  function sum(arr, fn) { return arr.reduce(function (a, x) { return a + (Number(fn(x)) || 0); }, 0); }

  function stats(ev, su) {
    var pv = ev.filter(function (e) { return e.type === "pageview"; });
    var visitors = uniq(pv, function (e) { return e.visitor_id; });
    // CTA = 신청 유도 버튼 클릭 + 구매 버튼(사전 예약) 클릭
    var cta = ev.filter(function (e) { return e.type === "cta_click" || e.type === "purchase_intent"; });
    var buys = purchases(ev);
    var signups = dedupSignups(su);
    return {
      views: pv.length,
      visitors: visitors,
      sessions: uniq(pv, function (e) { return e.session_id; }),
      ctaClicks: cta.length,
      ctaVisitors: uniq(cta.concat(buys), function (e) { return e.visitor_id; }),
      buyVisitors: uniq(buys, function (e) { return e.visitor_id; }),
      revenue: sum(buys, function (e) { return e.value; }),
      buys: buys,
      signups: signups.length,
      formStart: uniq(ev.filter(function (e) { return e.type === "form_start"; }), function (e) { return e.visitor_id; }),
      scroll50: uniq(ev.filter(function (e) { return e.type === "scroll"; }), function (e) { return e.visitor_id; })
    };
  }

  // ---------------- 렌더 ----------------
  function render() {
    var f = filtered();
    var s = stats(f.events, f.signups);
    renderKpi(f, s);
    renderTiles(s);
    renderDaily(f);
    renderFunnel(s);
    renderChannels(f);
    renderCtas(f);
    renderAds(f);
    renderSignups(f);
  }

  function renderTiles(s) {
    var t = [
      ["조회수", n(s.views), "페이지가 열린 횟수"],
      ["방문자 수", n(s.visitors), "고유 방문자 · 세션 " + n(s.sessions)],
      ["CTA 클릭", n(s.ctaClicks), "클릭한 방문자 " + n(s.ctaVisitors) + "명"],
      ["출시 알림 신청", n(s.signups), "중복 연락처 제외"],
      ["신청 전환율", pct(s.signups, s.visitors), "신청 ÷ 방문자"],
      ["사전 예약 매출", won(s.revenue), "구매 버튼 " + n(s.buyVisitors) + "명"]
    ];
    $("tiles").innerHTML = t.map(function (x) {
      return '<div class="tile"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div><div class="s">' + x[2] + "</div></div>";
    }).join("");
  }

  function renderKpi(f, s) {
    var adEv = f.events.filter(function (e) { return e.channel === "광고"; });
    var adVisitors = uniq(adEv.filter(function (e) { return e.type === "pageview"; }), function (e) { return e.visitor_id; });
    var adSignups = dedupSignups(f.signups.filter(function (x) { return x.channel === "광고"; })).length;
    var k = state.config.kpi;
    var rows = [
      { id: "signup", y: "랜딩페이지 방문자", z: "출시 알림을 위해 연락처를 남길 것이다", a: s.signups, b: s.visitors },
      { id: "purchase", y: "랜딩페이지 방문자", z: "유료 플랜 ‘사전 예약하기’(구매 버튼)를 누를 것이다", a: s.buyVisitors, b: s.visitors },
      { id: "adSignup", y: "광고를 보고 들어온 방문자", z: "출시 알림을 신청할 것이다", a: adSignups, b: adVisitors }
    ];
    $("kpis").innerHTML = rows.map(function (r) {
      var target = Number(k[r.id]) || 0;
      var actual = r.b ? r.a / r.b * 100 : null;
      var badge = actual == null ? '<span class="badge na">데이터 없음</span>'
        : actual >= target ? '<span class="badge ok">✓ 가설 달성</span>' : '<span class="badge no">✕ 미달</span>';
      var w = actual == null ? 0 : Math.min(100, actual / Math.max(target * 1.5, 1) * 100);
      var mark = Math.min(100, target / Math.max(target * 1.5, 1) * 100);
      return '<div class="kpi"><div class="stmt">' + esc(r.y) + '의 <input class="input" type="number" min="0" max="100" step="0.5" data-kpi="' + r.id + '" value="' + target + '" aria-label="목표 퍼센트">%는 ' + esc(r.z) + '.</div>' +
        '<div class="res"><b>' + (actual == null ? "–" : actual.toFixed(1) + "%") + '</b><span>' + n(r.a) + " / " + n(r.b) + "명</span><br>" + badge + "</div>" +
        '<div class="bar" title="세로선 = 목표"><i style="width:' + w + '%"></i><em style="left:' + mark + '%"></em></div></div>';
    }).join("");
    $("kpis").querySelectorAll("[data-kpi]").forEach(function (inp) {
      inp.addEventListener("change", function () { state.config.kpi[inp.getAttribute("data-kpi")] = Number(inp.value); renderKpi(filtered(), stats(filtered().events, filtered().signups)); });
    });
  }

  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function renderDaily(f) {
    var days = {};
    f.events.forEach(function (e) {
      if (e.type !== "pageview") return;
      var k = dayKey(e.ts); days[k] = days[k] || { v: {}, views: 0, su: 0 };
      days[k].views++; days[k].v[e.visitor_id] = 1;
    });
    dedupSignups(f.signups).forEach(function (x) { var k = dayKey(x.ts); days[k] = days[k] || { v: {}, views: 0, su: 0 }; days[k].su++; });
    var keys = Object.keys(days).sort().slice(-30);
    var box = $("daily");
    if (!keys.length) { box.innerHTML = '<p class="empty">아직 데이터가 없어요.</p>'; return; }
    var data = keys.map(function (k) { return { k: k, vis: Object.keys(days[k].v).length, views: days[k].views, su: days[k].su }; });
    var max = Math.max.apply(null, data.map(function (d) { return d.vis; })) || 1;
    var W = 600, H = 200, padL = 32, padB = 22, pw = W - padL, ph = H - padB - 8;
    var step = pw / data.length, bw = Math.max(4, Math.min(28, step - 6));
    var ticks = [0, Math.ceil(max / 2), max];
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="일별 방문자 수 막대 그래프">';
    ticks.forEach(function (t) {
      var y = 8 + ph - t / max * ph;
      svg += '<line x1="' + padL + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#e3e4ee" stroke-width="1"/>' +
        '<text x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#5d6280">' + t + "</text>";
    });
    data.forEach(function (d, i) {
      var h = d.vis / max * ph, x = padL + i * step + (step - bw) / 2, y = 8 + ph - h;
      var r = Math.min(4, bw / 2, h);
      svg += '<path d="M' + x + "," + (8 + ph) + " V" + (y + r) + " Q" + x + "," + y + " " + (x + r) + "," + y + " H" + (x + bw - r) + " Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + r) + " V" + (8 + ph) + ' Z" fill="#3940b3"/>';
      svg += '<rect class="hit" data-i="' + i + '" x="' + (padL + i * step) + '" y="0" width="' + step + '" height="' + (H - padB) + '" fill="transparent"/>';
      if (i === 0 || i === data.length - 1 || (data.length > 8 && i % Math.ceil(data.length / 6) === 0))
        svg += '<text x="' + (padL + i * step + step / 2) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="11" fill="#5d6280">' + d.k.slice(5).replace("-", "/") + "</text>";
    });
    svg += "</svg>";
    box.innerHTML = svg + '<div class="tip" hidden></div>';
    var tip = box.querySelector(".tip");
    box.querySelectorAll(".hit").forEach(function (el) {
      el.addEventListener("mousemove", function (ev) {
        var d = data[Number(el.getAttribute("data-i"))];
        var rect = box.getBoundingClientRect();
        tip.hidden = false;
        tip.style.left = (ev.clientX - rect.left) + "px"; tip.style.top = (ev.clientY - rect.top) + "px";
        tip.innerHTML = "<b>" + d.k + "</b><br>방문자 " + n(d.vis) + " · 조회 " + n(d.views) + " · 신청 " + n(d.su);
      });
      el.addEventListener("mouseleave", function () { tip.hidden = true; });
    });
  }

  function renderFunnel(s) {
    var steps = [["방문", s.visitors], ["스크롤 50%", s.scroll50], ["CTA 클릭", s.ctaVisitors], ["폼 작성 시작", s.formStart], ["신청 완료", s.signups]];
    var top = s.visitors || 1;
    $("funnel").innerHTML = steps.map(function (x) {
      return '<div class="funnel-row"><span>' + x[0] + '</span><div class="track"><div class="fill" style="width:' + Math.min(100, x[1] / top * 100) + '%"></div></div><span class="n">' + n(x[1]) + " <small>" + pct(x[1], s.visitors, 0) + "</small></span></div>";
    }).join("");
  }

  function groupTable(f, keyFn, label) {
    var g = {};
    function get(k) { return g[k] = g[k] || { ev: [], su: [] }; }
    f.events.forEach(function (e) { get(keyFn(e)).ev.push(e); });
    f.signups.forEach(function (x) { get(keyFn(x)).su.push(x); });
    var rows = Object.keys(g).map(function (k) { var s = stats(g[k].ev, g[k].su); s.k = k; return s; })
      .sort(function (a, b) { return b.visitors - a.visitors; });
    var tot = stats(f.events, f.signups);
    var head = "<thead><tr><th>" + label + "</th><th>조회수</th><th>방문자</th><th>CTA 클릭</th><th>신청</th><th>전환율</th><th>구매 클릭</th><th>매출</th></tr></thead>";
    function tr(s, name) { return "<tr><td>" + esc(name) + "</td><td>" + n(s.views) + "</td><td>" + n(s.visitors) + "</td><td>" + n(s.ctaClicks) + "</td><td>" + n(s.signups) + "</td><td>" + pct(s.signups, s.visitors) + "</td><td>" + n(s.buyVisitors) + "</td><td>" + won(s.revenue) + "</td></tr>"; }
    if (!rows.length) return head + '<tbody><tr><td colspan="8" class="l empty">아직 데이터가 없어요.</td></tr></tbody>';
    return head + "<tbody>" + rows.map(function (s) { return tr(s, s.k); }).join("") + "</tbody><tfoot>" + tr(tot, "합계") + "</tfoot>";
  }

  function renderChannels(f) {
    $("channels").innerHTML = groupTable(f, function (e) { return e.channel || "직접 유입"; }, "유입 경로");
    $("utms").innerHTML = groupTable(f, function (e) {
      return [e.utm_source || "(없음)", e.utm_medium || "(없음)", e.utm_campaign || "(없음)"].join(" / ");
    }, "source / medium / campaign");
  }

  var CTA_NAMES = {
    nav_signup: "상단 메뉴 ‘출시 알림 받기’", hero_signup: "히어로 ‘출시 알림 신청하기’", hero_pricing: "히어로 ‘얼리버드 가격 보기’",
    pricing_free: "가격 ‘무료로 시작 알림 받기’", form_submit: "폼 ‘신청하기’ 버튼", final_signup: "하단 ‘출시 알림 신청하기’",
    sticky_signup: "모바일 고정 버튼", buy_modal_signup: "예약 팝업 ‘연락처 남기기’", share: "완료 후 ‘링크 복사’"
  };
  var PLAN_NAMES = { report: "비교 리포트 1,900원", pass30: "30일 임장 패스 9,900원", team: "스터디 팀 플랜 19,900원" };

  function renderCtas(f) {
    var g = {};
    f.events.forEach(function (e) { if (e.type === "cta_click") { g[e.label] = g[e.label] || { c: 0, v: {} }; g[e.label].c++; g[e.label].v[e.visitor_id] = 1; } });
    var keys = Object.keys(g).sort(function (a, b) { return g[b].c - g[a].c; });
    $("ctas").innerHTML = "<thead><tr><th>CTA 버튼</th><th>클릭</th><th>클릭한 방문자</th></tr></thead><tbody>" +
      (keys.length ? keys.map(function (k) { return "<tr><td>" + esc(CTA_NAMES[k] || k) + "</td><td>" + n(g[k].c) + "</td><td>" + n(Object.keys(g[k].v).length) + "</td></tr>"; }).join("")
        : '<tr><td colspan="3" class="l empty">아직 클릭이 없어요.</td></tr>') + "</tbody>";
    var b = {};
    purchases(f.events).forEach(function (e) { b[e.label] = b[e.label] || { c: 0, r: 0 }; b[e.label].c++; b[e.label].r += Number(e.value) || 0; });
    var bk = Object.keys(b);
    $("buys").innerHTML = "<thead><tr><th>사전 예약(구매 버튼)</th><th>클릭 방문자</th><th>매출 환산</th></tr></thead><tbody>" +
      (bk.length ? bk.map(function (k) { return "<tr><td>" + esc(PLAN_NAMES[k] || k) + "</td><td>" + n(b[k].c) + "</td><td>" + won(b[k].r) + "</td></tr>"; }).join("")
        : '<tr><td colspan="3" class="l empty">아직 클릭이 없어요.</td></tr>') + "</tbody>";
  }

  // ---------------- 광고 ----------------
  function matchAd(ad, r) {
    var camp = String(ad.campaign || "").trim().toLowerCase();
    var src = String(ad.source || "").trim().toLowerCase();
    if (camp) return String(r.utm_campaign || "").toLowerCase() === camp && (!src || String(r.utm_source || "").toLowerCase() === src);
    if (src) return String(r.utm_source || "").toLowerCase() === src;
    return false;
  }

  function renderAds(f) {
    var ads = state.config.ads;
    var basis = state.config.convBasis || "signup";
    var T = { imp: 0, clk: 0, spend: 0, land: 0, conv: 0, rev: 0 };
    var body = ads.map(function (ad, i) {
      var ev = f.events.filter(function (e) { return matchAd(ad, e); });
      var su = f.signups.filter(function (x) { return matchAd(ad, x); });
      var s = stats(ev, su);
      var imp = num(ad.impressions), clk = num(ad.clicks), spend = num(ad.spend);
      var conv = basis === "signup" ? s.signups : s.buyVisitors;
      T.imp += imp; T.clk += clk; T.spend += spend; T.land += s.visitors; T.conv += conv; T.rev += s.revenue;
      return "<tr>" +
        '<td class="l"><input class="l" data-i="' + i + '" data-f="name" value="' + esc(ad.name) + '" placeholder="광고 이름"></td>' +
        '<td class="l"><input class="l" data-i="' + i + '" data-f="source" value="' + esc(ad.source) + '" placeholder="everytime"></td>' +
        '<td class="l"><input class="l" data-i="' + i + '" data-f="campaign" value="' + esc(ad.campaign) + '" placeholder="launch_1"></td>' +
        '<td><input data-i="' + i + '" data-f="impressions" inputmode="numeric" value="' + esc(ad.impressions) + '"></td>' +
        '<td><input data-i="' + i + '" data-f="clicks" inputmode="numeric" value="' + esc(ad.clicks) + '"></td>' +
        '<td><input data-i="' + i + '" data-f="spend" inputmode="numeric" value="' + esc(ad.spend) + '"></td>' +
        cells(imp, clk, spend, s.visitors, conv, s.revenue) +
        '<td><button class="del" data-del="' + i + '" type="button" aria-label="삭제">×</button></td></tr>';
    }).join("");
    function cells(imp, clk, spend, land, conv, rev) {
      return "<td>" + n(land) + "</td><td>" + n(conv) + "</td><td>" + won(rev) + "</td>" +
        "<td>" + pct(clk, imp, 2) + "</td><td>" + pct(conv, clk, 1) + "</td>" +
        "<td>" + (clk ? won(spend / clk) : "–") + "</td><td>" + (conv ? won(spend / conv) : "–") + "</td>" +
        "<td><b>" + (spend ? (rev / spend * 100).toFixed(0) + "%" : "–") + "</b></td>";
    }
    var head = '<thead><tr><th class="l">광고</th><th class="l">utm_source</th><th class="l">utm_campaign</th><th>노출 수</th><th>클릭 수</th><th>광고비(원)</th>' +
      "<th>랜딩 도착</th><th>전환</th><th>매출</th><th>CTR</th><th>CVR</th><th>CPC</th><th>CPA</th><th>ROAS</th><th></th></tr></thead>";
    var foot = ads.length ? '<tfoot><tr><td class="l" colspan="3">합계</td><td>' + n(T.imp) + "</td><td>" + n(T.clk) + "</td><td>" + n(T.spend) + "</td>" + cells(T.imp, T.clk, T.spend, T.land, T.conv, T.rev) + "<td></td></tr></tfoot>" : "";
    $("ads").innerHTML = head + "<tbody>" + (body || '<tr><td colspan="15" class="l empty">‘+ 광고 추가’를 눌러 집행한 광고를 입력하세요.</td></tr>') + "</tbody>" + foot;

    $("ads").querySelectorAll("input[data-f]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        ads[Number(inp.getAttribute("data-i"))][inp.getAttribute("data-f")] = inp.value.trim();
        renderAds(filtered());
      });
    });
    $("ads").querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () { ads.splice(Number(b.getAttribute("data-del")), 1); renderAds(filtered()); });
    });
  }

  $("add-ad").addEventListener("click", function () {
    state.config.ads.push({ name: "", source: "everytime", campaign: "", impressions: "", clicks: "", spend: "" });
    renderAds(filtered());
  });
  $("save-config").addEventListener("click", function () {
    var msg = $("saved-msg");
    if (DEMO) { msg.textContent = "샘플 모드에서는 저장되지 않아요."; return; }
    msg.textContent = "저장 중…";
    call("saveConfig", { config: state.config }).then(function (r) {
      msg.textContent = r.ok ? "저장됐어요 ✓" : "저장 실패: " + r.error;
    }).catch(function (e) { msg.textContent = "저장 실패: " + e.message; });
  });

  // ---------------- 신청자 ----------------
  function mask(c) {
    c = String(c || "");
    if (c.indexOf("@") > -1) { var p = c.split("@"); return p[0].slice(0, 2) + "***@" + p[1]; }
    var d = c.replace(/\D/g, ""); return d.length >= 10 ? d.slice(0, 3) + "-****-" + d.slice(-4) : "***";
  }
  function renderSignups(f) {
    var list = f.signups.slice().sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
    var m = $("mask").checked;
    $("signup-count").textContent = n(dedupSignups(list).length) + "명";
    $("signups").innerHTML = '<thead><tr><th class="l">신청 시각</th><th class="l">연락처</th><th class="l">목적</th><th class="l">월 임장</th><th class="l">기록 방법</th><th class="l">관심 지역</th><th class="l">예약 상품</th><th class="l">유입 경로</th><th class="l">campaign</th></tr></thead><tbody>' +
      (list.length ? list.map(function (x) {
        return '<tr><td class="l">' + esc(new Date(x.ts).toLocaleString("ko-KR")) + '</td><td class="l">' + esc(m ? mask(x.contact) : x.contact) + '</td><td class="l">' + esc(x.purpose) + '</td><td class="l">' + esc(x.frequency) + '</td><td class="l">' + esc(x.method) + '</td><td class="l">' + esc(x.region) + '</td><td class="l">' + esc(x.plan) + '</td><td class="l">' + esc(x.channel) + '</td><td class="l">' + esc(x.utm_campaign) + "</td></tr>";
      }).join("") : '<tr><td colspan="9" class="l empty">아직 신청자가 없어요.</td></tr>') + "</tbody>";
  }

  function csv(rows, name) {
    if (!rows.length) return;
    var cols = Object.keys(rows[0]);
    var out = [cols.join(",")].concat(rows.map(function (r) {
      return cols.map(function (c) { var v = String(r[c] == null ? "" : r[c]); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(",");
    })).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + out], { type: "text/csv;charset=utf-8" }));
    a.download = name; a.click();
  }
  $("dl-signups").addEventListener("click", function () { csv(filtered().signups, "imjangmate_signups.csv"); });
  $("dl-events").addEventListener("click", function () { csv(filtered().events, "imjangmate_events.csv"); });

  // ---------------- UTM 링크 ----------------
  function landingUrl() { return location.origin + location.pathname.replace(/admin\.html$/, ""); }
  function buildUtm() {
    var p = new URLSearchParams();
    ["source", "medium", "campaign", "content"].forEach(function (k) { var v = $("u-" + k).value.trim(); if (v) p.set("utm_" + k, v); });
    $("u-url").value = landingUrl() + "?" + p.toString();
  }
  ["u-source", "u-medium", "u-campaign", "u-content"].forEach(function (id) { $(id).addEventListener("input", buildUtm); $(id).addEventListener("change", buildUtm); });
  buildUtm();
  $("u-copy").addEventListener("click", function () { var b = this; navigator.clipboard.writeText($("u-url").value).then(function () { b.textContent = "복사됨"; setTimeout(function () { b.textContent = "복사"; }, 1500); }); });

  // ---------------- 샘플 데이터 ----------------
  function demoData() {
    var ev = [], su = [], rnd = mulberry(7);
    var chans = [
      { channel: "광고", utm_source: "everytime", utm_medium: "paid", utm_campaign: "launch_1", w: .35, conv: .12 },
      { channel: "광고", utm_source: "instagram", utm_medium: "paid", utm_campaign: "auction_reels", w: .2, conv: .07 },
      { channel: "에브리타임", utm_source: "everytime", utm_medium: "post", utm_campaign: "free_post", w: .15, conv: .1 },
      { channel: "검색", utm_source: "", utm_medium: "", utm_campaign: "", w: .1, conv: .09 },
      { channel: "카페·커뮤니티", utm_source: "naver_cafe", utm_medium: "post", utm_campaign: "auction_cafe", w: .12, conv: .16 },
      { channel: "직접 유입", utm_source: "", utm_medium: "", utm_campaign: "", w: .08, conv: .05 }
    ];
    var purposes = ["재테크·경매", "재테크·경매", "내 집 마련·신혼집", "첫 자취·이사", "임장 스터디"];
    var plans = [["report", 1900], ["pass30", 9900], ["team", 19900]];
    var now = Date.now();
    for (var i = 0; i < 640; i++) {
      var r = rnd(), acc = 0, c = chans[0];
      for (var j = 0; j < chans.length; j++) { acc += chans[j].w; if (r < acc) { c = chans[j]; break; } }
      var ts = new Date(now - Math.floor(rnd() * 14) * 864e5 - Math.floor(rnd() * 8e7)).toISOString();
      var vid = "v" + i, sid = "s" + i;
      var b = { ts: ts, visitor_id: vid, session_id: sid, channel: c.channel, utm_source: c.utm_source, utm_medium: c.utm_medium, utm_campaign: c.utm_campaign, internal: 0, device: rnd() < .78 ? "mobile" : "desktop" };
      var views = rnd() < .2 ? 2 : 1;
      for (var v = 0; v < views; v++) ev.push(Object.assign({ type: "pageview" }, b));
      if (rnd() < .55) ev.push(Object.assign({ type: "scroll", label: "50%" }, b));
      if (rnd() < .3) ev.push(Object.assign({ type: "cta_click", label: ["hero_signup", "nav_signup", "hero_pricing", "sticky_signup", "final_signup"][Math.floor(rnd() * 5)] }, b));
      if (rnd() < .07) { var p = plans[Math.floor(rnd() * 2.4)]; ev.push(Object.assign({ type: "purchase_intent", label: p[0], value: p[1] }, b)); }
      var willSign = rnd() < c.conv;
      if (willSign || rnd() < .06) ev.push(Object.assign({ type: "form_start", label: "signup" }, b));
      if (willSign) {
        ev.push(Object.assign({ type: "signup" }, b));
        su.push(Object.assign({ contact: "010" + String(10000000 + i * 7919).slice(-8), purpose: purposes[Math.floor(rnd() * purposes.length)], frequency: ["1~2곳", "3~5곳", "6곳 이상"][Math.floor(rnd() * 3)], method: "메모 앱 + 갤러리", region: ["마포구", "강남구", "수원 영통", ""][Math.floor(rnd() * 4)], plan: "", agree: "Y" }, b));
      }
    }
    return {
      ok: true, generatedAt: new Date().toISOString(), events: ev, signups: su,
      config: { ads: [
        { name: "에브리타임 배너", source: "everytime", campaign: "launch_1", impressions: "18400", clicks: "312", spend: "50000" },
        { name: "인스타 릴스", source: "instagram", campaign: "auction_reels", impressions: "9600", clicks: "171", spend: "30000" }
      ] }
    };
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------------- 시작 ----------------
  if (DEMO) { load(); return; }
  state.key = ss("im_admin_key") || "";
  if (state.key && C.ENDPOINT) load(); else showLogin();
})();
