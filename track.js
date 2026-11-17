/* =========================================================
   임장메이트 방문·전환 추적
   - pageview      : 페이지 조회 (조회수)
   - visitor_id    : 브라우저별 고유 ID (방문자 수)
   - cta_click     : data-cta 가 붙은 버튼 클릭
   - purchase_intent: 가격 카드 '사전 예약하기' 클릭 (value = 가격, ROAS 계산용)
   - signup        : 출시 알림 신청 완료 (전환)
   유입 경로는 세션 첫 접속 시의 UTM 파라미터와 referrer 로 분류합니다.
   ========================================================= */
(function () {
  var C = window.IMJANG_CONFIG || {};

  function safeGet(storage, k) { try { return window[storage].getItem(k); } catch (e) { return null; } }
  function safeSet(storage, k, v) { try { window[storage].setItem(k, v); } catch (e) {} }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // 팀원 본인 접속 제외: 한 번 ?internal=1 로 들어오면 그 브라우저는 내부 트래픽으로 표시
  var params = new URLSearchParams(location.search);
  if (params.get("internal") === "1") safeSet("localStorage", "im_internal", "1");
  if (params.get("internal") === "0") safeSet("localStorage", "im_internal", "0");
  var internal = safeGet("localStorage", "im_internal") === "1";

  var vid = safeGet("localStorage", "im_vid");
  var isNewVisitor = false;
  if (!vid) { vid = uid(); isNewVisitor = true; safeSet("localStorage", "im_vid", vid); }
  var sid = safeGet("sessionStorage", "im_sid");
  if (!sid) { sid = uid(); safeSet("sessionStorage", "im_sid", sid); }

  function classify(src, med, ref) {
    src = (src || "").toLowerCase(); med = (med || "").toLowerCase();
    var host = "";
    try { host = ref ? new URL(ref).hostname.toLowerCase() : ""; } catch (e) {}
    if (host && host === location.hostname) host = "";
    var paid = /^(cpc|ppc|paid|paid_social|paidsocial|ad|ads|display|banner|cpm)$/.test(med);
    if (paid) return "광고";
    if (/everytime/.test(src) || /everytime\.kr/.test(host)) return "에브리타임";
    if (/^(naver|google|daum|bing|search)$/.test(src) || med === "organic" ||
        /(^|\.)google\./.test(host) || /search\.naver\.com|m\.search\.naver/.test(host) ||
        /search\.daum\.net|bing\.com|search\.yahoo|duckduckgo/.test(host)) return "검색";
    if (/insta|facebook|fb|threads|kakao|youtube|tiktok|twitter|x\.com|blog|band/.test(src) ||
        /instagram|facebook|threads|kakao|youtube|tiktok|twitter|t\.co|x\.com|blog\.naver|band\.us/.test(host)) return "SNS·블로그";
    if (/cafe|community|club|dcinside|clien/.test(src) || /cafe\.naver|cafe\.daum|dcinside|clien|fmkorea/.test(host)) return "카페·커뮤니티";
    if (src) return "기타(" + src + ")";
    if (host) return "기타(" + host + ")";
    return "직접 유입";
  }

  // 세션 단위 유입 정보 (세션 첫 페이지 기준으로 고정)
  var attr = null;
  try { attr = JSON.parse(safeGet("sessionStorage", "im_attr") || "null"); } catch (e) {}
  // 새 UTM 링크로 들어오면 그 링크 기준으로 다시 분류
  if (!attr || (params.get("utm_source") && params.get("utm_source") !== attr.utm_source) ||
      (params.get("utm_campaign") && params.get("utm_campaign") !== attr.utm_campaign)) {
    attr = {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || "",
      referrer: document.referrer || ""
    };
    attr.channel = classify(attr.utm_source, attr.utm_medium, attr.referrer);
    safeSet("sessionStorage", "im_attr", JSON.stringify(attr));
  }
  // 방문자 최초 유입 경로 (first touch)
  if (!safeGet("localStorage", "im_first")) safeSet("localStorage", "im_first", attr.channel);

  var device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop";

  function post(action, data) {
    if (!C.ENDPOINT) { if (window.console) console.debug("[imjang]", action, data); return Promise.resolve(); }
    return fetch(C.ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, data: data })
    }).catch(function () {});
  }

  function base(type, extra) {
    var d = {
      type: type,
      visitor_id: vid,
      session_id: sid,
      new_visitor: isNewVisitor ? 1 : 0,
      page: location.pathname,
      channel: attr.channel,
      first_channel: safeGet("localStorage", "im_first") || attr.channel,
      utm_source: attr.utm_source,
      utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign,
      utm_content: attr.utm_content,
      referrer: attr.referrer,
      device: device,
      internal: internal ? 1 : 0,
      label: "",
      value: ""
    };
    for (var k in extra) d[k] = extra[k];
    return d;
  }

  function gtagEvent(name, p) { if (window.gtag) window.gtag("event", name, p || {}); }

  var api = {
    event: function (type, extra) {
      gtagEvent(type, extra);
      return post("event", base(type, extra || {}));
    },
    signup: function (fields) {
      gtagEvent("sign_up", { method: fields.purpose });
      var ev = base("signup", { label: fields.purpose || "" });
      post("event", ev);
      var row = base("signup", {});
      for (var k in fields) row[k] = fields[k];
      return post("signup", row);
    },
    channel: function () { return attr.channel; }
  };
  window.imjangTrack = api;

  // (선택) GA4
  if (C.GA_ID) {
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(C.GA_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", C.GA_ID);
  }

  // 조회수
  api.event("pageview", { label: document.title });

  // CTA 클릭 자동 수집
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-cta]");
    if (el) api.event("cta_click", { label: el.getAttribute("data-cta") });
  }, true);

  // 스크롤 깊이 (50%, 90% 한 번씩)
  var marks = { 50: false, 90: false };
  window.addEventListener("scroll", function () {
    var h = document.documentElement;
    var pct = (h.scrollTop + window.innerHeight) / h.scrollHeight * 100;
    [50, 90].forEach(function (m) {
      if (!marks[m] && pct >= m) { marks[m] = true; api.event("scroll", { label: m + "%" }); }
    });
  }, { passive: true });
})();
