/* 임장메이트 랜딩 인터랙션 */
(function () {
  var T = function () { return window.imjangTrack || { event: function () {}, signup: function () { return Promise.resolve(); } }; };

  // 헤더 그림자 + 모바일 하단 CTA
  var header = document.querySelector(".site-header");
  var sticky = document.getElementById("sticky-cta");
  var signupSec = document.getElementById("signup");
  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle("scrolled", y > 8);
    var r = signupSec.getBoundingClientRect();
    var formVisible = r.top < window.innerHeight && r.bottom > 0;
    sticky.classList.toggle("show", y > 520 && !formVisible);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // 스크롤 등장 애니메이션
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  // 가격 '사전 예약하기' → 구매 의향 이벤트 + 모달
  var modal = document.getElementById("buy-modal");
  var planChip = document.getElementById("buy-plan");
  var planField = document.getElementById("plan-field");
  var lastFocus = null;
  function openModal(plan, price) {
    planChip.textContent = plan + " · " + Number(price).toLocaleString("ko-KR") + "원";
    planField.value = plan;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.getElementById("buy-go").focus();
  }
  function closeModal() { modal.hidden = true; if (lastFocus) lastFocus.focus(); }
  document.querySelectorAll("[data-buy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var price = btn.getAttribute("data-price");
      var plan = btn.getAttribute("data-plan");
      T().event("purchase_intent", { label: btn.getAttribute("data-buy"), value: Number(price) });
      openModal(plan, price);
    });
  });
  document.getElementById("buy-close").addEventListener("click", closeModal);
  document.getElementById("buy-go").addEventListener("click", function () { modal.hidden = true; });
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  // 신청 폼
  var form = document.getElementById("signup-form");
  var err = document.getElementById("form-error");
  var submitBtn = document.getElementById("submit-btn");
  var started = false;
  form.addEventListener("input", function () {
    if (!started) { started = true; T().event("form_start", { label: "signup" }); }
  });

  function validContact(v) {
    var phone = v.replace(/[\s-]/g, "");
    return /^01[016789]\d{7,8}$/.test(phone) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    var fd = new FormData(form);
    if (fd.get("website")) return; // 봇
    var contact = (fd.get("contact") || "").trim();
    if (!validContact(contact)) { err.textContent = "휴대폰 번호(010-…) 또는 이메일을 정확히 입력해 주세요."; form.contact.focus(); return; }
    if (!fd.get("purpose")) { err.textContent = "임장 목적을 선택해 주세요."; return; }
    if (!fd.get("frequency")) { err.textContent = "한 달 임장 횟수를 선택해 주세요."; return; }
    if (!fd.get("agree")) { err.textContent = "개인정보 수집·이용에 동의해 주세요."; return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "신청 중…";
    T().signup({
      contact: contact,
      purpose: fd.get("purpose"),
      frequency: fd.get("frequency"),
      method: fd.get("method") || "",
      region: (fd.get("region") || "").trim(),
      plan: fd.get("plan") || "",
      agree: "Y"
    }).then(function () {
      form.hidden = true;
      document.getElementById("form-done").hidden = false;
    });
  });

  // 링크 복사
  document.getElementById("share-btn").addEventListener("click", function () {
    var url = location.origin + location.pathname + "?utm_source=referral&utm_medium=share";
    var btn = this;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
      btn.textContent = "복사됐어요!";
    }, function () { btn.textContent = url; });
  });
})();
