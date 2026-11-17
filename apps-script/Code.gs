/**
 * 임장메이트 데이터 수집 백엔드 (Google Apps Script)
 *
 * 설치 방법은 README.md 의 "데이터 수집 설정" 참고.
 *  - 구글 시트 > 확장 프로그램 > Apps Script 에 이 파일 내용을 붙여 넣기
 *  - 프로젝트 설정 > 스크립트 속성에 ADMIN_KEY (대시보드 비밀번호) 추가
 *  - 배포 > 새 배포 > 웹 앱 (실행: 나, 액세스: 모든 사용자)
 *
 * 시트 구성 (자동 생성)
 *  - events  : 조회·클릭·전환 이벤트 (개인정보 없음)
 *  - signups : 출시 알림 신청자 (연락처 포함, 대시보드 비밀번호로만 조회 가능)
 *  - config  : 대시보드에서 입력한 광고비·노출수·KPI 목표
 */

var EVENT_COLS = ['ts', 'type', 'visitor_id', 'session_id', 'new_visitor', 'page', 'channel', 'first_channel',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'referrer', 'device', 'internal', 'label', 'value'];
var SIGNUP_COLS = ['ts', 'contact', 'purpose', 'frequency', 'method', 'region', 'plan', 'agree',
  'visitor_id', 'session_id', 'channel', 'first_channel', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
  'referrer', 'device', 'internal'];
var EVENT_TYPES = ['pageview', 'cta_click', 'purchase_intent', 'signup', 'form_start', 'scroll'];

function doGet() {
  return json_({ ok: true, service: 'imjangmate' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  var action = body.action;

  if (action === 'event') return json_(append_('events', EVENT_COLS, body.data, true));
  if (action === 'signup') return json_(append_('signups', SIGNUP_COLS, body.data, false));

  // ---- 여기부터는 관리자(제작자) 전용 ----
  if (!checkKey_(body.key)) {
    Utilities.sleep(800);
    return json_({ ok: false, error: 'unauthorized' });
  }
  if (action === 'dashboard') return json_(dashboard_());
  if (action === 'saveConfig') return json_(saveConfig_(body.config));
  return json_({ ok: false, error: 'unknown_action' });
}

function checkKey_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!real && typeof key === 'string' && key === real;
}

function sheet_(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (cols) {
      sh.appendRow(cols);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

// 시트 수식 주입 방지 + 길이 제한
function clean_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  var s = String(v).slice(0, 500);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function append_(name, cols, data, isEvent) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'no_data' };
  if (isEvent && EVENT_TYPES.indexOf(data.type) === -1) return { ok: false, error: 'bad_type' };
  if (!isEvent && (!data.contact || data.agree !== 'Y')) return { ok: false, error: 'invalid_signup' };
  var row = cols.map(function (c) {
    if (c === 'ts') return new Date();
    return clean_(data[c]);
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_(name, cols).appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function readAll_(name, cols) {
  var sh = sheet_(name, cols);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
  return values.map(function (r) {
    var o = {};
    cols.forEach(function (c, i) {
      var v = r[i];
      if (v instanceof Date) v = v.toISOString();
      if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
      o[c] = v;
    });
    return o;
  });
}

function dashboard_() {
  var cfg = sheet_('config', ['key', 'value']);
  var raw = cfg.getLastRow() >= 2 ? cfg.getRange(2, 2).getValue() : '';
  var config = {};
  try { config = raw ? JSON.parse(raw) : {}; } catch (e) {}
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    events: readAll_('events', EVENT_COLS),
    signups: readAll_('signups', SIGNUP_COLS),
    config: config
  };
}

function saveConfig_(config) {
  var sh = sheet_('config', ['key', 'value']);
  var str = JSON.stringify(config || {});
  if (str.length > 45000) return { ok: false, error: 'too_large' };
  if (sh.getLastRow() < 2) sh.appendRow(['dashboard', str]);
  else sh.getRange(2, 1, 1, 2).setValues([['dashboard', str]]);
  return { ok: true };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 설치 확인용: Apps Script 편집기에서 직접 실행하면 시트 3개가 만들어집니다. */
function setup() {
  sheet_('events', EVENT_COLS);
  sheet_('signups', SIGNUP_COLS);
  sheet_('config', ['key', 'value']);
}
