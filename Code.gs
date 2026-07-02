/****************************************************
 * YK ANGELS PULSE - Code.gs
 * Drive 택배신청 파일 → RAW → 출고_스냅샷_LOG → 시간대별_출고현황 → DASHBOARD
 *
 * 핵심 수정
 * 1) 30분 단위 파일은 모두 수집, 화면/표시는 1시간 단위 최신 파일만 사용
 * 2) 운영일은 YYYY-MM-DD 텍스트로 고정
 * 3) 생산성 = 구간 완료 ÷ 출고인원 ÷ 경과시간
 * 4) 생산성 위험등급 표시
 ****************************************************/
 
const OUTBOUND_RAW_FOLDER_ID = "1vu3806VFI2ktmxMCdqSNV57qswyUGI3B";
const TZ = "Asia/Seoul";

const SHEET_RAW = "RAW";
const SHEET_SNAPSHOT = "출고_스냅샷_LOG";
const SHEET_HOURLY = "시간대별_출고현황";
const SHEET_DASH = "DASHBOARD";
const SHEET_SETTING = "출고_설정";
const SHEET_BREAK = "출고_휴게설정";
const SHEET_HOUR_PEOPLE = "출고_시간대인원";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("출고 대시보드")
    .addItem("전체 실행", "runOutboundDashboardAll")
    .addItem("RAW 최신 파일 가져오기", "importLatestOutboundRawFromDrive")
    .addItem("폴더 신규 데이터 동기화", "syncSnapshotLogFromFolder")
    .addItem("시간대별 현황 생성", "makeOutboundHourlyReport")
    .addSeparator()
    .addItem("폴더 전체 데이터 재계산", "rebuildSnapshotLogFromFolder")
    .addItem("30분 자동 업데이트 설치(매시 00분/30분)", "installHourlyOutboundTrigger")
    .addItem("출고 설정 기본값 생성", "setupOutboundSettings")
    .addItem("대시보드만 초기화", "resetOutboundDashboard")
    .addToUi();
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  const callback = e && e.parameter && e.parameter.callback;

  if (action) {
    let data = {};

    try {
      if (action === "pulse") {
        data = getPulseData();

      } else if (action === "customer") {
        data = getCustomerAnalysisWeb_();

      } else if (action === "aiot" || action === "ai" || action === "javis") {
        data = askOutboundAiAnalysisWeb_(e.parameter || {});

      } else if (action === "saveSettings") {
        const raw = e.parameter.data || "{}";
        const parsed = JSON.parse(raw);
        const msg = saveOutboundSettings(parsed);
        data = { ok: true, message: msg };

      } else {
        data = {
          ok: true,
          message: "Outbound Productivity API",
          actions: ["pulse", "customer", "aiot", "saveSettings"]
        };
      }

    } catch (err) {
      data = {
        ok: false,
        error: err.message || String(err)
      };
    }

    const json = JSON.stringify(data);

    if (callback) {
      return ContentService
        .createTextOutput(callback + "(" + json + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("YK ANGELS PULSE")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1");
}

function runOutboundDashboardAll() {
  importLatestOutboundRawFromDrive();
  syncSnapshotLogFromFolder();
  makeOutboundHourlyReport();
}

function installHourlyOutboundTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "runOutboundDashboardAll") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("runOutboundDashboardAll")
    .timeBased()
    .everyHours(1)
    .nearMinute(0)
    .create();

  ScriptApp.newTrigger("runOutboundDashboardAll")
    .timeBased()
    .everyHours(1)
    .nearMinute(30)
    .create();

  SpreadsheetApp.getUi().alert("자동 업데이트 설치 완료\n매시간 00분/30분 전후로 실행됩니다.");
}

/****************************************************
 * WEB APP
 ****************************************************/

function getPulseData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName(SHEET_DASH);
  const hourly = ss.getSheetByName(SHEET_HOURLY);

  const result = {
    dashboard: {},
    hourly: [],
    settings: getOutboundSettings()
  };

  if (dash && dash.getLastRow() > 0) {
    dash.getDataRange().getDisplayValues().forEach(r => {
      if (r[0]) result.dashboard[r[0]] = r[1];
    });
  }

  result.dashboard["현재 생산성"] =
    result.dashboard["현재 생산성"] || result.dashboard["생산성"] || "0";

  result.dashboard["평균 생산성"] =
    result.dashboard["평균 생산성"] || result.dashboard["현재까지 평균 생산성"] || "0";

  result.dashboard["생산성"] = result.dashboard["현재 생산성"];
  result.dashboard["현재까지 평균 생산성"] = result.dashboard["평균 생산성"];

  if (hourly && hourly.getLastRow() > 1) {
    const values = hourly.getDataRange().getDisplayValues();
    const header = values[0];
    for (let i = 1; i < values.length; i++) {
      const obj = {};
      header.forEach((h, idx) => obj[h] = values[i][idx]);
      result.hourly.push(obj);
    }
  }

  return result;
}


function verifyAdminPassword(password) {
  return String(password || "").trim() === "1531";
}

/****************************************************
 * DRIVE
 ****************************************************/

function importLatestOutboundRawFromDrive() {
  const files = getOutboundFiles_();
  const latest = files.length ? files[files.length - 1] : null;
  if (!latest) throw new Error("Drive 폴더에서 택배신청 파일을 찾지 못했습니다.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName(SHEET_RAW) || ss.insertSheet(SHEET_RAW);
  const values = readDriveFileAtoZ_(latest.file);

  raw.clearContents();
  raw.clearFormats();
  raw.getRange(1, 1, values.length, 26).setValues(values);
  raw.getRange(1, 1, 1, 26)
    .setFontWeight("bold")
    .setBackground("#123b7a")
    .setFontColor("#ffffff");
  raw.setFrozenRows(1);
  raw.autoResizeColumns(1, 26);

  PropertiesService.getScriptProperties().setProperties({
    LAST_RAW_FILE_ID: latest.file.getId(),
    LAST_RAW_FILE_NAME: latest.name,
    LAST_RAW_DB_TIME: Utilities.formatDate(latest.dbTime, TZ, "yyyy-MM-dd HH:mm:ss"),
    LAST_RAW_IMPORT_TIME: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss")
  });

  return "RAW 갱신 완료: " + latest.name;
}

function getOutboundFiles_() {
  const folder = DriveApp.getFolderById(OUTBOUND_RAW_FOLDER_ID);
  const files = folder.getFiles();
  const arr = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();

    if (!name.includes("택배신청")) continue;
    if (name.includes("__TEMP_RAW_IMPORT__")) continue;
    if (name.startsWith("__TEMP")) continue;

    const dbTime = parseDbTimeFromFileName_(name) || file.getLastUpdated();
    arr.push({ file, name, dbTime });
  }

  arr.sort((a, b) => a.dbTime.getTime() - b.dbTime.getTime());
  return arr;
}

function parseDbTimeFromFileName_(name) {
  const m = String(name).match(/택배신청[_\-]?(\d{8})(\d{1,6})/);
  if (!m) return null;

  const ymd = m[1];
  const t = String(m[2] || "").replace(/\D/g, "");

  let hh = 0;
  let mm = 0;
  let ss = 0;

  // 6자리: HHMMSS 예) 175928 => 17:59:28
  // 5자리: HHMMs  예) 11025  => 11:02:05 / 15419 => 15:41:09
  // 4자리: HMMs   예) 7563   => 07:56:03 / 9564 => 09:56:04
  if (t.length >= 6) {
    hh = Number(t.slice(0, 2));
    mm = Number(t.slice(2, 4));
    ss = Number(t.slice(4, 6));
  } else if (t.length === 5) {
    hh = Number(t.slice(0, 2));
    mm = Number(t.slice(2, 4));
    ss = Number(t.slice(4, 5));
  } else if (t.length === 4) {
    hh = Number(t.slice(0, 1));
    mm = Number(t.slice(1, 3));
    ss = Number(t.slice(3, 4));
  } else if (t.length === 3) {
    hh = Number(t.slice(0, 1));
    mm = Number(t.slice(1, 3));
    ss = 0;
  } else {
    hh = Number(t || 0);
    mm = 0;
    ss = 0;
  }

  if (hh > 26 || mm > 59 || ss > 59) return null;

  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));

  const result = new Date(y, mo, d, hh, mm, ss);
  if (hh >= 24) result.setDate(result.getDate() + 1);
  return result;
}

function readDriveFileAtoZ_(file) {
  const mime = file.getMimeType();

  if (mime === MimeType.GOOGLE_SHEETS) {
    const tempSs = SpreadsheetApp.openById(file.getId());
    const sh = tempSs.getSheets()[0];
    const lastRow = Math.max(sh.getLastRow(), 1);
    return sh.getRange(1, 1, lastRow, 26).getValues();
  }

  const resource = {
    title: "__TEMP_RAW_IMPORT__" + file.getName(),
    mimeType: MimeType.GOOGLE_SHEETS
  };

  const converted = Drive.Files.copy(resource, file.getId(), { convert: true });
  Utilities.sleep(1200);

  const tempSs = SpreadsheetApp.openById(converted.id);
  const sh = tempSs.getSheets()[0];
  const lastRow = Math.max(sh.getLastRow(), 1);
  const values = sh.getRange(1, 1, lastRow, 26).getValues();

  DriveApp.getFileById(converted.id).setTrashed(true);
  return values;
}

/****************************************************
 * SNAPSHOT
 ****************************************************/

function appendLatestSnapshot() {
  const props = PropertiesService.getScriptProperties();
  const fileId = props.getProperty("LAST_RAW_FILE_ID") || "RAW_MANUAL";
  const fileName = props.getProperty("LAST_RAW_FILE_NAME") || "RAW_MANUAL";
  const dbTimeText = props.getProperty("LAST_RAW_DB_TIME") || Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
  const dbTime = toDate_(dbTimeText) || new Date();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName(SHEET_RAW);
  if (!raw) throw new Error("RAW 시트가 없습니다.");

  const log = ss.getSheetByName(SHEET_SNAPSHOT) || ss.insertSheet(SHEET_SNAPSHOT);
  setupSnapshotSheet_(log);

  if (snapshotExists_(log, fileId, dbTime)) return "이미 저장된 데이터입니다.";

  const stat = calcRawSnapshotFromValues_(raw.getDataRange().getValues());
  appendSnapshotRow_(log, stat, dbTime, fileName, fileId);
  sortSnapshotLog_(log);
  formatSnapshotSheet_(log);

  return "데이터 저장 완료: " + fileName;
}

function syncSnapshotLogFromFolder() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(SHEET_SNAPSHOT) || ss.insertSheet(SHEET_SNAPSHOT);
  setupSnapshotSheet_(log);

  const files = getOutboundFiles_();
  if (!files.length) throw new Error("Drive 폴더에서 택배신청 파일을 찾지 못했습니다.");

  const rows = [];

  files.forEach(item => {
    if (snapshotExists_(log, item.file.getId(), item.dbTime)) return;
    const values = readDriveFileAtoZ_(item.file);
    const stat = calcRawSnapshotFromValues_(values);
    rows.push(makeSnapshotRow_(stat, item.dbTime, item.name, item.file.getId()));
  });

  if (rows.length) {
    log.getRange(log.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  sortSnapshotLog_(log);
  formatSnapshotSheet_(log);
  log.autoResizeColumns(1, log.getLastColumn());

  return "신규 데이터 동기화 완료: " + rows.length + "개 추가";
}

function rebuildSnapshotLogFromFolder() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(SHEET_SNAPSHOT) || ss.insertSheet(SHEET_SNAPSHOT);

  log.clear();
  log.clearFormats();
  setupSnapshotSheet_(log);

  const files = getOutboundFiles_();
  if (!files.length) throw new Error("Drive 폴더에서 택배신청 파일을 찾지 못했습니다.");

  const rows = [];
  files.forEach(item => {
    const values = readDriveFileAtoZ_(item.file);
    const stat = calcRawSnapshotFromValues_(values);
    rows.push(makeSnapshotRow_(stat, item.dbTime, item.name, item.file.getId()));
  });

  if (rows.length) log.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

  sortSnapshotLog_(log);
  formatSnapshotSheet_(log);
  log.autoResizeColumns(1, log.getLastColumn());

  importLatestOutboundRawFromDrive();
  makeOutboundHourlyReport();

  SpreadsheetApp.getUi().alert("폴더 전체 데이터 재계산 완료: " + rows.length + "개 파일");
}

function setupSnapshotSheet_(sheet) {
  const header = [
    "DB시간", "운영일", "시간대", "파일명", "파일ID",
    "총인입", "출고요청", "출고작업중", "출고완료", "출고요청취소",
    "잔여", "완료PCS", "작업중평균OL", "완료평균OL", "작업중평균PCS", "완료평균PCS", "기록시간"
  ];

  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.getRange(1, 1, 1, header.length)
    .setFontWeight("bold")
    .setBackground("#123b7a")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);
}

function formatSnapshotSheet_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 1, lastRow - 1, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sheet.getRange(2, 2, lastRow - 1, 2).setNumberFormat("@");
  sheet.getRange(2, 6, lastRow - 1, 7).setNumberFormat("#,##0");
  sheet.getRange(2, 13, lastRow - 1, 4).setNumberFormat("0.0");
  sheet.getRange(2, 17, lastRow - 1, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
}

function sortSnapshotLog_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 3) return;

  sheet.getRange(2, 1, lastRow - 1, lastCol).sort([
    { column: 2, ascending: true },
    { column: 1, ascending: true }
  ]);
}

function snapshotExists_(sheet, fileId, dbTime) {
  const last = sheet.getLastRow();
  if (last < 2) return false;

  const targetTime = Utilities.formatDate(dbTime, TZ, "yyyy-MM-dd HH:mm:ss");
  const values = sheet.getRange(2, 1, last - 1, 5).getDisplayValues();

  return values.some(r => {
    return String(r[4] || "").trim() === String(fileId || "").trim()
      || String(r[0] || "").trim() === targetTime;
  });
}

function calcRawSnapshotFromValues_(values) {
  const total = {};
  const request = {};
  const working = {};
  const done = {};
  const cancel = {};
  const remain = {};
  const workingMap = {};
  const doneMap = {};
  let donePcs = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const reqNo = String(row[1] || "").trim();
    const status = String(row[3] || "").trim();
    const ol = getOlValue_(row[7]);
    const pcs = normalizeNumber_(row[8]);

    if (!reqNo || !status) continue;

    total[reqNo] = true;

    if (status === "출고요청") {
      request[reqNo] = true;
      remain[reqNo] = true;
      if (!workingMap[reqNo]) workingMap[reqNo] = { ol: 0, pcs: 0 };
      workingMap[reqNo].ol += ol;
      workingMap[reqNo].pcs += pcs;
    } else if (status === "출고작업중") {
      working[reqNo] = true;
      remain[reqNo] = true;
      if (!workingMap[reqNo]) workingMap[reqNo] = { ol: 0, pcs: 0 };
      workingMap[reqNo].ol += ol;
      workingMap[reqNo].pcs += pcs;
    } else if (status === "출고완료") {
      done[reqNo] = true;
      if (!doneMap[reqNo]) doneMap[reqNo] = { ol: 0, pcs: 0 };
      doneMap[reqNo].ol += ol;
      doneMap[reqNo].pcs += pcs;
      donePcs += pcs;
    } else if (status === "출고요청취소") {
      cancel[reqNo] = true;
    }
  }

  return {
    totalIn: Object.keys(total).length,
    request: Object.keys(request).length,
    working: Object.keys(working).length,
    done: Object.keys(done).length,
    cancel: Object.keys(cancel).length,
    remain: Object.keys(remain).length,
    donePcs: donePcs,
    workingAvgOL: avgMapField_(workingMap, "ol"),
    doneAvgOL: avgMapField_(doneMap, "ol"),
    workingAvgPCS: avgMapField_(workingMap, "pcs"),
    doneAvgPCS: avgMapField_(doneMap, "pcs")
  };
}

function makeSnapshotRow_(stat, dbTime, fileName, fileId) {
  const dbTimeText = Utilities.formatDate(dbTime, TZ, "yyyy-MM-dd HH:mm:ss");
  const workDate = getWorkDateByDate_(dbTime);
  const hourKey = getHourKey_(dbTime);
  const recordTime = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");

  return [
    dbTimeText, workDate, hourKey, fileName, fileId,
    stat.totalIn, stat.request, stat.working, stat.done, stat.cancel,
    stat.remain, stat.donePcs, stat.workingAvgOL, stat.doneAvgOL, stat.workingAvgPCS, stat.doneAvgPCS, recordTime
  ];
}

function appendSnapshotRow_(sheet, stat, dbTime, fileName, fileId) {
  const row = makeSnapshotRow_(stat, dbTime, fileName, fileId);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

/****************************************************
 * HOURLY / DASHBOARD
 ****************************************************/

function makeOutboundHourlyReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(SHEET_SNAPSHOT);

  if (!log || log.getLastRow() < 2) {
    throw new Error("출고_스냅샷_LOG가 없습니다. 먼저 [폴더 전체 데이터 재계산]을 실행하세요.");
  }

  const settings = getOutboundSettings();
  const workDate = settings.base.workDate || getWorkDate_();
  const snapshots = getSnapshots_(log, workDate);

  if (!snapshots.length) throw new Error("해당 운영일 데이터가 없습니다: " + workDate);

  const hourlyRows = buildHourlyRows_(snapshots, settings);

  writeHourlySheet_(ss.getSheetByName(SHEET_HOURLY) || ss.insertSheet(SHEET_HOURLY), hourlyRows);
  writeDashboardFromSnapshots_(ss.getSheetByName(SHEET_DASH) || ss.insertSheet(SHEET_DASH), hourlyRows, settings);
}

function getSnapshots_(sheet, workDate) {
  const values = sheet.getDataRange().getValues();
  const targetWorkDate = normalizeDateKey_(workDate);
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const rowWorkDate = normalizeDateKey_(r[1]);

    if (rowWorkDate !== targetWorkDate) continue;

    const dbTime = toDate_(r[0]);
    if (!dbTime) continue;

    rows.push({
      dbTime: dbTime,
      workDate: rowWorkDate,
      hour: getHourKey_(dbTime),
      fileName: String(r[3] || ""),
      fileId: String(r[4] || ""),
      totalIn: normalizeNumber_(r[5]),
      request: normalizeNumber_(r[6]),
      working: normalizeNumber_(r[7]),
      done: normalizeNumber_(r[8]),
      cancel: normalizeNumber_(r[9]),
      remain: normalizeNumber_(r[10]),
      donePcs: normalizeNumber_(r[11]),
      workingAvgOL: normalizeNumber_(r[12]),
      doneAvgOL: normalizeNumber_(r[13]),
      workingAvgPCS: normalizeNumber_(r[14]),
      doneAvgPCS: normalizeNumber_(r[15])
    });
  }

  rows.sort((a, b) => a.dbTime.getTime() - b.dbTime.getTime());
  return rows;
}

function buildHourlyRows_(snapshots, settings) {
  if (!snapshots.length) return [];

  // 30분마다 파일은 모두 LOG에 쌓되,
  // 시간대별 현황은 1시간 단위로 묶고 해당 시간 안의 가장 최신 파일만 사용합니다.
  // 예: 09:26, 09:56 파일이 있으면 09:00 행은 09:56 파일 기준입니다.
  const byHour = {};
  snapshots.forEach(s => {
    const hour = s.hour || getHourKey_(s.dbTime);
    if (!byHour[hour] || s.dbTime > byHour[hour].dbTime) {
      byHour[hour] = s;
    }
  });

  let reps = Object.keys(byHour).sort().map(k => byHour[k]);

  // 전일 마감 누계가 다음날 파일에 남아있다가 새 일자로 리셋되는 경우 방어
  let resetIndex = 0;
  for (let i = 1; i < reps.length; i++) {
    const prev = reps[i - 1];
    const cur = reps[i];
    const totalDrop = cur.totalIn < prev.totalIn * 0.7;
    const doneDrop = cur.done < prev.done * 0.7;
    if (totalDrop || doneDrop) resetIndex = i;
  }
  reps = reps.slice(resetIndex);

  const rows = [];
  let prevTotalIn = 0;
  let prevDone = 0;
  let prevTime = null;

  reps.forEach(cur => {
    const hour = cur.hour || getHourKey_(cur.dbTime);
    const totalIn = Number(cur.totalIn || 0);
    const done = Number(cur.done || 0);

    const inCnt = Math.max(0, totalIn - prevTotalIn);
    const doneCnt = Math.max(0, done - prevDone);

    let startTime = null;
    if (prevTime) {
      startTime = prevTime;
    } else {
      startTime = getFirstActiveShiftStart_(settings, cur.dbTime);
    }

    let elapsedHours = 0;
    let manHour = 0;
    let people = 0;

    if (startTime) {
      // 식사/휴게 차감여부=Y 구간은 Man-Hour에서 제외됩니다.
      // 단, 대표 파일 시간이 식사/휴게 중이어도 해당 1시간 구간에 작업 가능 시간이 있으면 생산성을 계산합니다.
manHour = getNetManHourBetween_(settings, startTime, cur.dbTime);

// 화면 표시용 출고인원은 현재 대표 파일 시간 기준 인원으로 표시
people = getPeopleAtDateTime_(settings, cur.dbTime);

if (people > 0) {
  elapsedHours = manHour / people;
}
    }

    const productivity = manHour > 0 ? doneCnt / manHour : 0;
    const risk = getProductivityRisk_(productivity, Number(settings.base.targetProductivity || 26), people);

    const remain = Number(cur.remain || 0);
    const progressBase = done + remain;
    const progress = progressBase > 0 ? done / progressBase : 0;

    rows.push({
      hour: hour,
      dbTime: cur.dbTime,
      inCnt: inCnt,
      doneCnt: doneCnt,
      people: people,
      elapsedHours: elapsedHours,
      manHour: manHour,
      productivity: productivity,
      risk: risk,
      cumDone: done,
      remain: remain,
      progress: progress,
      latest: cur
    });

    prevTotalIn = totalIn;
    prevDone = done;
    prevTime = cur.dbTime;
  });

  return rows;
}

function writeHourlySheet_(sheet, rows) {
  sheet.clear();
  sheet.clearFormats();

  const output = [[
    "시간대", "시간당 인입", "시간당 완료", "출고인원", "경과시간",
    "생산성", "생산성 위험등급", "누계완료", "잔여", "진행률"
  ]];

  rows.forEach(r => {
    output.push([
      r.hour, r.inCnt, r.doneCnt, r.people, r.elapsedHours,
      r.productivity, r.risk, r.cumDone, r.remain, r.progress
    ]);
  });

  sheet.getRange(1, 1, output.length, output[0].length).setValues(output);
  sheet.getRange(1, 1, 1, output[0].length)
    .setFontWeight("bold")
    .setBackground("#123b7a")
    .setFontColor("#ffffff");

  if (output.length > 1) {
    sheet.getRange(2, 1, output.length - 1, 1).setNumberFormat("@");
    sheet.getRange(2, 2, output.length - 1, 3).setNumberFormat("#,##0");
    sheet.getRange(2, 5, output.length - 1, 2).setNumberFormat("0.0");
    sheet.getRange(2, 8, output.length - 1, 2).setNumberFormat("#,##0");
    sheet.getRange(2, 10, output.length - 1, 1).setNumberFormat("0.0%");
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, output[0].length);
}

function writeDashboardFromSnapshots_(sheet, hourlyRows, settings) {
  sheet.clear();
  sheet.clearFormats();

  const lastRow = hourlyRows.length ? hourlyRows[hourlyRows.length - 1] : null;
  if (!lastRow) return;

  const latest = lastRow.latest;
  const workDateText = normalizeDateKey_(latest.workDate) || settings.base.workDate || getWorkDate_();
  const currentPeople = Number(lastRow.people || 0);
  const target = Number(settings.base.targetProductivity || 25);

  const currentProductivity = Number(lastRow.productivity || 0);
  const totalDoneCnt = hourlyRows.reduce((sum, r) => sum + Number(r.doneCnt || 0), 0);
  const totalManHour = hourlyRows.reduce((sum, r) => sum + Number(r.manHour || 0), 0);
  const avgProductivity = totalManHour > 0 ? totalDoneCnt / totalManHour : 0;

  const recentRows = hourlyRows
    .filter(r => Number(r.doneCnt || 0) > 0 || Number(r.productivity || 0) > 0)
    .slice(-3);
  const recentDoneCnt = recentRows.reduce((sum, r) => sum + Number(r.doneCnt || 0), 0);
  const recentManHour = recentRows.reduce((sum, r) => sum + Number(r.manHour || 0), 0);
  const recentProductivity = recentManHour > 0 ? recentDoneCnt / recentManHour : currentProductivity;
  const currentHourlyCapacity = currentPeople * currentProductivity;
  const avgHourlyCapacity = currentPeople * avgProductivity;
  const recentHourlyCapacity = currentPeople * recentProductivity;
  const targetHourlyCapacity = currentPeople * target;
  const forecastHourlyCapacity = Math.max(0,
    (currentHourlyCapacity * 0.25) +
    (avgHourlyCapacity * 0.25) +
    (recentHourlyCapacity * 0.30) +
    (targetHourlyCapacity * 0.20)
  );

  const risk = getProductivityRisk_(forecastHourlyCapacity / Math.max(currentPeople, 1), target, currentPeople);
  const achieve = target > 0 ? avgProductivity / target : 0;

  const targetDone = target * totalManHour;
  const lackQty = Math.max(targetDone - totalDoneCnt, 0);

  const nextTarget = Math.ceil(Number(latest.done || 0) / 100) * 100;
  const nextTargetFixed = nextTarget <= Number(latest.done || 0) ? nextTarget + 100 : nextTarget;
  const nextRemain = nextTargetFixed - Number(latest.done || 0);

  const progressBase = Number(latest.done || 0) + Number(latest.remain || 0);
  const progress = progressBase > 0 ? Number(latest.done || 0) / progressBase : 0;

  const data = [
    ["출고 생산성 현황", ""],
    ["운영일", workDateText],
    ["센터", settings.base.center || "YI03"],
    ["총 인입", Number(latest.totalIn || 0)],
    ["출고완료", Number(latest.done || 0)],
    ["잔여", Number(latest.remain || 0)],
    ["진행률", progress],
    ["현재 출고 인원", currentPeople],
    ["현재 생산성", currentProductivity],
    ["평균 생산성", avgProductivity],
    ["최근 생산성", recentProductivity],
    ["예측 시간당 처리량", forecastHourlyCapacity],
    ["생산성", currentProductivity],
    ["현재까지 평균 생산성", avgProductivity],
    ["생산성 위험등급", risk],
    ["목표 생산성", target],
    ["목표 달성률", achieve],
    ["목표 부족", lackQty],
    ["다음 출고완료 타겟", nextTargetFixed],
    ["다음 타겟까지", nextRemain],
    ["작업중 평균 O/L", Number(latest.workingAvgOL || 0)],
    ["완료 평균 O/L", Number(latest.doneAvgOL || 0)],
    ["작업중 평균 PCS", Number(latest.workingAvgPCS || 0)],
    ["완료 평균 PCS", Number(latest.doneAvgPCS || 0)],
    ["갱신시간", new Date()]
  ];

  sheet.getRange("B:B").setNumberFormat("@");
  sheet.getRange(1, 1, data.length, 2).setValues(data);

  sheet.getRange("A1:B1")
    .setFontWeight("bold")
    .setBackground("#2b57d9")
    .setFontColor("#ffffff");

  sheet.getRange("B2:B3").setNumberFormat("@");
  sheet.getRange("B4:B6").setNumberFormat("#,##0");
  sheet.getRange("B7").setNumberFormat("0.0%");
  sheet.getRange("B8").setNumberFormat("#,##0");
  sheet.getRange("B9:B14").setNumberFormat("0.0");
  sheet.getRange("B15").setNumberFormat("@");
  sheet.getRange("B16").setNumberFormat("0.0");
  sheet.getRange("B17").setNumberFormat("0.0%");
  sheet.getRange("B18:B20").setNumberFormat("#,##0");
  sheet.getRange("B21:B24").setNumberFormat("0.0");
  sheet.getRange("B25").setNumberFormat("yyyy-mm-dd hh:mm:ss");

  sheet.autoResizeColumns(1, 2);
}

/****************************************************
 * SETTINGS
 ****************************************************/

function setupOutboundSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const base = ss.getSheetByName(SHEET_SETTING) || ss.insertSheet(SHEET_SETTING);
  base.clear();
  base.getRange("A:A").setNumberFormat("@");

  base.getRange(1, 1, 1, 12).setValues([[
    "운영일", "센터", "목표생산성",
    "주간출고인원", "야간출고인원",
    "주간시작", "주간종료",
    "야간시작", "야간종료",
    "주간잔업", "야간잔업", "메모"
  ]]);

  base.getRange(2, 1, 1, 12).setValues([[
    getWorkDate_(), "YI03", 26,
    0, 0,
    "09:30", "18:30",
    "17:00", "02:00",
    "00:00", "00:00", ""
  ]]);

  const br = ss.getSheetByName(SHEET_BREAK) || ss.insertSheet(SHEET_BREAK);
  br.clear();
  br.getRange("A:A").setNumberFormat("@");

  br.getRange(1, 1, 1, 7).setValues([[
    "운영일", "근무조", "유형", "시작시간", "종료시간", "차감여부", "메모"
  ]]);

  br.getRange(2, 1, 5, 7).setValues([
    [getWorkDate_(), "주간", "식사", "12:30", "13:30", "Y", ""],
    [getWorkDate_(), "주간", "휴게", "15:30", "15:50", "Y", ""],
    [getWorkDate_(), "야간", "식사", "19:00", "20:00", "Y", ""],
    [getWorkDate_(), "야간", "휴게", "22:00", "22:10", "Y", ""],
    [getWorkDate_(), "야간", "휴게", "24:00", "24:10", "Y", ""]
  ]);

  const hour = ss.getSheetByName(SHEET_HOUR_PEOPLE) || ss.insertSheet(SHEET_HOUR_PEOPLE);
  hour.clear();
  hour.getRange("A:B").setNumberFormat("@");

  hour.getRange(1, 1, 1, 6).setValues([[
    "운영일", "시간대", "주간증감", "야간증감", "총증감", "메모"
  ]]);

  [base, br, hour].forEach(sh => {
    sh.getRange(1, 1, 1, sh.getLastColumn())
      .setFontWeight("bold")
      .setBackground("#123b7a")
      .setFontColor("#ffffff");
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, sh.getLastColumn());
  });

  return "출고 설정 시트 생성 완료";
}

function getOutboundSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupOutboundSettingsIfNeeded_();

  const workDate = getWorkDate_();

  ensureOutboundSettingForDate_(workDate);

  const base = ss.getSheetByName(SHEET_SETTING);
  const rest = ss.getSheetByName(SHEET_BREAK);
  const hour = ss.getSheetByName(SHEET_HOUR_PEOPLE);

  const row = findSettingRowByDate_(base, workDate);
  const baseValues = base.getRange(row, 1, 1, 12).getValues()[0];
  const baseDisplay = base.getRange(row, 1, 1, 12).getDisplayValues()[0];

  return {
    base: {
      workDate: workDate,
      center: String(baseDisplay[1] || "YI03").trim(),
      targetProductivity: normalizeNumber_(baseValues[2] || baseDisplay[2] || 25),
      dayPeople: normalizeNumber_(baseValues[3] || baseDisplay[3] || 0),
      nightPeople: normalizeNumber_(baseValues[4] || baseDisplay[4] || 0),
      dayStart: normalizeShortTime_(baseDisplay[5] || "09:30"),
      dayEnd: normalizeShortTime_(baseDisplay[6] || "18:30"),
      nightStart: normalizeShortTime_(baseDisplay[7] || "17:00"),
      nightEnd: normalizeShortTime_(baseDisplay[8] || "02:00"),
      dayOvertime: normalizeShortTime_(baseDisplay[9] || "00:00"),
      nightOvertime: normalizeShortTime_(baseDisplay[10] || "00:00"),
      memo: String(baseDisplay[11] || "").trim()
    },
    breaks: getRowsByWorkDate_(rest, 7, workDate),
    hourlyPeople: getRowsByWorkDate_(hour, 6, workDate)
  };
}

function saveOutboundSettings(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupOutboundSettingsIfNeeded_();

  const base = ss.getSheetByName(SHEET_SETTING);
  const rest = ss.getSheetByName(SHEET_BREAK);
  const hour = ss.getSheetByName(SHEET_HOUR_PEOPLE);

  const b = data.base || {};
  const workDate = normalizeDateKey_(b.workDate) || getWorkDate_();

  ensureOutboundSettingForDate_(workDate);

  const row = findSettingRowByDate_(base, workDate);

  base.getRange("A:A").setNumberFormat("@");
  base.getRange(row, 1, 1, 12).setValues([[
    workDate,
    b.center || "YI03",
    Number(b.targetProductivity || 25),
    Number(b.dayPeople || 0),
    Number(b.nightPeople || 0),
    b.dayStart || "09:30",
    b.dayEnd || "18:30",
    b.nightStart || "17:00",
    b.nightEnd || "02:00",
    b.dayOvertime || "00:00",
    b.nightOvertime || "00:00",
    b.memo || ""
  ]]);

  replaceRowsByWorkDate_(rest, 7, workDate, sortBreakRows_(data.breaks || []));
  replaceRowsByWorkDate_(hour, 6, workDate, sortPeopleRows_(data.hourlyPeople || []));

  makeOutboundHourlyReport();
  return "저장 완료";
}

function setupOutboundSettingsIfNeeded_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET_SETTING) ||
      !ss.getSheetByName(SHEET_BREAK) ||
      !ss.getSheetByName(SHEET_HOUR_PEOPLE)) {
    setupOutboundSettings();
  }
}


function sortBreakRows_(rows) {
  return (rows || [])
    .filter(r => String((r || []).join("")).trim())
    .map(r => [
      normalizeDateKey_(r[0]) || String(r[0] || ""),
      String(r[1] || "").trim(),
      String(r[2] || "").trim(),
      normalizeShortTime_(r[3] || "00:00"),
      normalizeShortTime_(r[4] || "00:00"),
      String(r[5] || "Y").trim().toUpperCase() === "N" ? "N" : "Y",
      String(r[6] || "").trim()
    ])
    .sort((a, b) => {
      const da = String(a[0]);
      const db = String(b[0]);
      if (da !== db) return da.localeCompare(db);

      const ta = timeTextToMinutes_(a[3]);
      const tb = timeTextToMinutes_(b[3]);
      if (ta !== tb) return ta - tb;

      const shiftOrder = { "주간": 1, "야간": 2 };
      return (shiftOrder[a[1]] || 9) - (shiftOrder[b[1]] || 9);
    });
}

function sortPeopleRows_(rows) {
  return (rows || [])
    .filter(r => String((r || []).join("")).trim())
    .sort((a, b) => String(a[1] || "").localeCompare(String(b[1] || "")));
}


/****************************************************
 * PEOPLE
 ****************************************************/

function getHourlyPeopleMap_(settings, workDate, snapshots) {
  const map = {};
  const hourKeys = snapshots ? snapshots.map(s => s.hour || getHourKey_(s.dbTime)) : makeWorkHours_(workDate);

  hourKeys.forEach(hourKey => {
    const d = toDate_(hourKey);
    map[hourKey] = d ? getPeopleAtDateTime_(settings, d) : 0;
  });

  return map;
}

function getFirstActiveShiftStart_(settings, dbTime) {
  const workDate = settings.base.workDate || getWorkDateByDate_(dbTime);
  const candidates = [];

  const dayStart = makeDateByWorkTime_(workDate, settings.base.dayStart || "09:30");
  const dayEnd = makeDateByWorkTime_(workDate, addOvertimeToEnd_(settings.base.dayEnd || "18:30", settings.base.dayOvertime || "00:00"));
  if (dayEnd <= dayStart) dayEnd.setDate(dayEnd.getDate() + 1);
  if (dbTime >= dayStart && dbTime <= dayEnd) candidates.push(dayStart);

  const nightStart = makeDateByWorkTime_(workDate, settings.base.nightStart || "17:00");
  const nightEnd = makeDateByWorkTime_(workDate, addOvertimeToEnd_(settings.base.nightEnd || "02:00", settings.base.nightOvertime || "00:00"));
  if (nightEnd <= nightStart) nightEnd.setDate(nightEnd.getDate() + 1);
  if (dbTime >= nightStart && dbTime <= nightEnd) candidates.push(nightStart);

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
}

function getTotalPeople_(settings) {
  return Number(settings.base.dayPeople || 0) + Number(settings.base.nightPeople || 0);
}

/****************************************************
 * COMMON
 ****************************************************/

function avgMapField_(map, field) {
  const keys = Object.keys(map);
  if (!keys.length) return 0;
  const sum = keys.reduce((s, k) => s + Number(map[k][field] || 0), 0);
  return sum / keys.length;
}

function getOlValue_(value) {
  const n = normalizeNumber_(value);
  if (n > 0) return n;
  return String(value || "").trim() ? 1 : 0;
}

function makeWorkHours_(workDate) {
  const start = new Date(workDate + "T00:00:00");
  const cutoff = getCurrentCutoff_(workDate);
  const arr = [];

  for (let i = 0; i <= 26; i++) {
    const d = new Date(start);
    d.setHours(d.getHours() + i);
    if (d > cutoff) break;
    arr.push(Utilities.formatDate(d, TZ, "yyyy-MM-dd HH:00"));
  }

  return arr;
}

function getWorkRange_(workDate) {
  const start = new Date(workDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(2, 59, 59, 999);
  return { start, end };
}

function getCurrentCutoff_(workDate) {
  const range = getWorkRange_(workDate);
  const now = new Date();

  if (now < range.start) return range.start;
  if (now > range.end) return range.end;
  return now;
}

function getWorkDate_() {
  return getWorkDateByDate_(new Date());
}

function getWorkDateByDate_(dateObj) {
  const base = new Date(dateObj);
  const hour = Number(Utilities.formatDate(base, TZ, "H"));

  if (hour < 8) base.setDate(base.getDate() - 1);
  return Utilities.formatDate(base, TZ, "yyyy-MM-dd");
}

function isHourInShift_(workDate, hourKey, startText, endText) {
  const hourStart = toDate_(hourKey);
  if (!hourStart) return false;

  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hourEnd.getHours() + 1);

  const shiftStart = makeDateByWorkTime_(workDate, startText);
  let shiftEnd = makeDateByWorkTime_(workDate, endText);

  if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);
  return hourStart < shiftEnd && hourEnd > shiftStart;
}

function makeDateByWorkTime_(workDate, timeText) {
  const parts = normalizeShortTime_(timeText || "00:00").split(":");
  let h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);

  const d = new Date(workDate + "T00:00:00");

  if (h >= 24) {
    d.setDate(d.getDate() + 1);
    h -= 24;
  }

  d.setHours(h, m, 0, 0);
  return d;
}

function addOvertimeToEnd_(endTime, overtime) {
  const total = timeTextToMinutes_(endTime) + overtimeToMinutes_(overtime);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function timeTextToMinutes_(timeText) {
  const p = normalizeShortTime_(timeText || "00:00").split(":");
  return Number(p[0] || 0) * 60 + Number(p[1] || 0);
}

function overtimeToMinutes_(value) {
  const v = normalizeShortTime_(value || "00:00");
  const p = v.split(":");
  return Number(p[0] || 0) * 60 + Number(p[1] || 0);
}

function normalizeShortTime_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, TZ, "HH:mm");
  }

  let text = String(value || "00:00").trim();

  if (text === "0") return "00:00";
  if (text === "0.5") return "00:30";
  if (text === "1") return "01:00";
  if (text === "1.5") return "01:30";
  if (text === "2") return "02:00";
  if (text === "2.5") return "02:30";
  if (text === "3") return "03:00";

  const m = text.match(/^(\d{1,2}):(\d{1,2})/);
  if (m) return String(Number(m[1])).padStart(2, "0") + ":" + String(Number(m[2])).padStart(2, "0");

  return "00:00";
}


function getHourKey_(dateObj) {
  const d = new Date(dateObj);
  d.setMinutes(0, 0, 0);
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd HH:00");
}

// 기존 코드 호환용. 이제 표시는 1시간 단위입니다.
function getTimeSlotKey_(dateObj) {
  return getHourKey_(dateObj);
}

function normalizeSlotKey_(value) {
  return normalizeHourKey_(value);
}

function makeWorkSlots_(workDate) {
  return makeWorkHours_(workDate);
}

function isSlotInShift_(workDate, slotKey, startText, endText) {
  return isHourInShift_(workDate, slotKey, startText, endText);
}

function parsePeopleEffectiveTime_(workDate, value) {
  if (value === null || value === undefined || value === "") return null;

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return value;
  }

  // Google Sheets 시간만 입력된 숫자값 예: 13:30 = 0.5625
  if (typeof value === "number") {
    if (value > 0 && value < 1) {
      const d = new Date(workDate + "T00:00:00");
      d.setMinutes(Math.round(value * 24 * 60), 0, 0);
      return d;
    }
    if (value > 1000) return serialToDate_(value);
  }

  let text = String(value || "").trim();
  if (!text) return null;

  // 한글 오전/오후 표시 보정: 2026. 6. 26 오후 1:30:00
  let isPm = /오후/.test(text);
  let isAm = /오전/.test(text);
  text = text.replace(/오전|오후/g, "").trim();

  // 날짜 + 시간 직접 파싱
  let m = text.match(/^(\d{4})[\.\-\/\s]+(\d{1,2})[\.\-\/\s]+(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    let h = Number(m[4]);
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5]), Number(m[6] || 0), 0);
  }

  // 시간만 입력된 경우: 13:30 또는 1:30 PM
  m = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    let h = Number(m[1]);
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    const t = String(h).padStart(2, "0") + ":" + String(Number(m[2])).padStart(2, "0");
    return makeDateByWorkTime_(workDate, t);
  }

  const d = toDate_(text);
  return d || null;
}

function getPeopleDiffAtDateTime_(settings, workDate, dateTime) {
  let diffTotal = 0;

  (settings.hourlyPeople || []).forEach(r => {
    const rowWorkDate = normalizeDateKey_(r[0]);
    if (rowWorkDate && rowWorkDate !== workDate) return;

    const effectiveTime = parsePeopleEffectiveTime_(workDate, r[1]);
    if (!effectiveTime) return;

    if (dateTime >= effectiveTime) {
      const dayDiff = normalizeNumber_(r[2]);
      const nightDiff = normalizeNumber_(r[3]);

      // 총증감 컬럼은 표시용으로만 보고, 실제 계산에는 주간/야간 증감만 반영
      diffTotal += dayDiff + nightDiff;
    }
  });

  return diffTotal;
}

function getPeopleAtDateTime_(settings, dateTime) {
  const workDate = settings.base.workDate || getWorkDateByDate_(dateTime);
  const base = new Date(dateTime);
  let people = 0;

  const dayPeople = Number(settings.base.dayPeople || 0);
  const nightPeople = Number(settings.base.nightPeople || 0);

  const dayStart = settings.base.dayStart || "09:30";
  const dayEnd = addOvertimeToEnd_(settings.base.dayEnd || "18:30", settings.base.dayOvertime || "00:00");
  const nightStart = settings.base.nightStart || "17:00";
  const nightEnd = addOvertimeToEnd_(settings.base.nightEnd || "02:00", settings.base.nightOvertime || "00:00");

  // 중첩 시간은 주간 + 야간 합산
  // 식사/휴게 차감여부=Y 구간은 해당 근무조 기본 인원을 제외
  if (isDateTimeInShift_(workDate, base, dayStart, dayEnd) && !isBreakActiveForShift_(settings, workDate, base, "주간")) {
    people += dayPeople;
  }

  if (isDateTimeInShift_(workDate, base, nightStart, nightEnd) && !isBreakActiveForShift_(settings, workDate, base, "야간")) {
    people += nightPeople;
  }

  // 특정 시간 인원 변경은 B열이 날짜+시간, 시간만, Date객체, 시리얼값이어도 모두 적용
  people += getPeopleDiffAtDateTime_(settings, workDate, base);

  return Math.max(0, people);
}


function getMaxPeopleBetween_(settings, startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (!start || !end || end <= start) return 0;

  const points = [start.getTime(), end.getTime()];
  collectBoundaryTimes_(settings, start, end).forEach(t => {
    if (t > start && t < end) points.push(t.getTime());
  });

  const uniq = Array.from(new Set(points)).sort((a, b) => a - b);
  let maxPeople = 0;

  for (let i = 0; i < uniq.length - 1; i++) {
    const segStart = new Date(uniq[i]);
    const segEnd = new Date(uniq[i + 1]);
    const mid = new Date((segStart.getTime() + segEnd.getTime()) / 2);

    const hours = Math.max((segEnd.getTime() - segStart.getTime()) / 3600000, 0);
    if (hours <= 0) continue;

    const people = getPeopleAtDateTime_(settings, mid);
    if (people > maxPeople) maxPeople = people;
  }

  return maxPeople;
}

function getNetManHourBetween_(settings, startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (!start || !end || end <= start) return 0;

  const points = [start.getTime(), end.getTime()];
  collectBoundaryTimes_(settings, start, end).forEach(t => {
    if (t > start && t < end) points.push(t.getTime());
  });

  const uniq = Array.from(new Set(points)).sort((a, b) => a - b);
  let manHour = 0;

  for (let i = 0; i < uniq.length - 1; i++) {
    const segStart = new Date(uniq[i]);
    const segEnd = new Date(uniq[i + 1]);
    const mid = new Date((segStart.getTime() + segEnd.getTime()) / 2);
    const people = getPeopleAtDateTime_(settings, mid);
    const hours = Math.max((segEnd.getTime() - segStart.getTime()) / 3600000, 0);
    manHour += people * hours;
  }

  return manHour;
}

function collectBoundaryTimes_(settings, startTime, endTime) {
  const workDate = settings.base.workDate || getWorkDateByDate_(startTime);
  const list = [];

  // 주/야간 시작·종료 경계
  [
    [settings.base.dayStart || "09:30", addOvertimeToEnd_(settings.base.dayEnd || "18:30", settings.base.dayOvertime || "00:00")],
    [settings.base.nightStart || "17:00", addOvertimeToEnd_(settings.base.nightEnd || "02:00", settings.base.nightOvertime || "00:00")]
  ].forEach(pair => {
    const st = makeDateByWorkTime_(workDate, pair[0]);
    let ed = makeDateByWorkTime_(workDate, pair[1]);
    if (ed <= st) ed.setDate(ed.getDate() + 1);
    list.push(st, ed);
  });

  // 휴게/식사 경계
  (settings.breaks || []).forEach(r => {
    const rowWorkDate = normalizeDateKey_(r[0]);
    const deduct = String(r[5] || "").trim().toUpperCase();
    if (rowWorkDate !== workDate || deduct !== "Y") return;

    const range = makeBreakRange_(workDate, String(r[1] || "").trim(), r[3], r[4], settings);
    if (!range) return;
    list.push(range.start, range.end);
  });

  // 특정 시간 인원 변경 경계
  (settings.hourlyPeople || []).forEach(r => {
    const rowWorkDate = normalizeDateKey_(r[0]);
    if (rowWorkDate && rowWorkDate !== workDate) return;
    const t = parsePeopleEffectiveTime_(workDate, r[1]);
    if (t) list.push(t);
  });

  return list.filter(t => t && t > startTime && t < endTime);
}

function makeBreakRange_(workDate, shiftName, startText, endText, settings) {
  const shift = String(shiftName || "").trim();

  let st = makeDateByWorkTime_(workDate, startText);
  let ed = makeDateByWorkTime_(workDate, endText);
  if (ed <= st) ed.setDate(ed.getDate() + 1);

  // 야간조의 00:00~02:00 휴게는 운영일 다음날로 보정
  // 사용자가 24:00 대신 00:00으로 입력해도 야간 종료 전 휴게로 인식합니다.
  if (shift === "야간") {
    const nightStart = makeDateByWorkTime_(workDate, settings.base.nightStart || "17:00");
    let nightEnd = makeDateByWorkTime_(workDate, addOvertimeToEnd_(settings.base.nightEnd || "02:00", settings.base.nightOvertime || "00:00"));
    if (nightEnd <= nightStart) nightEnd.setDate(nightEnd.getDate() + 1);

    if (st < nightStart) {
      const movedSt = new Date(st);
      const movedEd = new Date(ed);
      movedSt.setDate(movedSt.getDate() + 1);
      movedEd.setDate(movedEd.getDate() + 1);

      if (movedSt >= nightStart && movedSt < nightEnd) {
        st = movedSt;
        ed = movedEd;
      }
    }
  }

  return { start: st, end: ed };
}

function isBreakActiveForShift_(settings, workDate, dateTime, shiftName) {
  const targetShift = String(shiftName || "").trim();

  return (settings.breaks || []).some(r => {
    const rowWorkDate = normalizeDateKey_(r[0]);
    const rowShift = String(r[1] || "").trim();
    const deduct = String(r[5] || "").trim().toUpperCase();

    if (rowWorkDate !== workDate) return false;
    if (deduct !== "Y") return false;
    if (rowShift && rowShift !== targetShift) return false;

    const range = makeBreakRange_(workDate, rowShift || targetShift, r[3], r[4], settings);
    if (!range) return false;

    return dateTime >= range.start && dateTime < range.end;
  });
}


function isDateTimeInShift_(workDate, dateTime, startText, endText) {
  const shiftStart = makeDateByWorkTime_(workDate, startText);
  let shiftEnd = makeDateByWorkTime_(workDate, endText);

  if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);

  return dateTime >= shiftStart && dateTime < shiftEnd;
}

function getProductivityRisk_(productivity, target, people) {
  if (!people || people <= 0) return "대기";
  if (!target || target <= 0) return "확인";

  const rate = productivity / target;
  if (rate >= 1) return "안정";
  if (rate >= 0.85) return "주의";
  return "위험";
}

function normalizeHourKey_(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return getHourKey_(value);
  }

  if (typeof value === "number") {
    return getHourKey_(serialToDate_(value));
  }

  const text = String(value).trim();
  const d = toDate_(text);
  if (d) return getHourKey_(d);

  return text;
}

function normalizeDateKey_(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, TZ, "yyyy-MM-dd");
  }

  if (typeof value === "number") {
    const d = serialToDate_(value);
    return Utilities.formatDate(d, TZ, "yyyy-MM-dd");
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const d = toDate_(text);
  if (d) return Utilities.formatDate(d, TZ, "yyyy-MM-dd");

  return "";
}

function normalizeNumber_(value) {
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;

  const n = Number(String(value).replace(/,/g, "").replace("%", "").trim());
  return isNaN(n) ? 0 : n;
}

function serialToDate_(serial) {
  return new Date(Math.round((Number(serial) - 25569) * 86400 * 1000));
}

function resetOutboundDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  [SHEET_HOURLY, SHEET_DASH].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh) {
      sh.clear();
      sh.clearFormats();
    }
  });

  SpreadsheetApp.getUi().alert("대시보드 초기화 완료\n출고_스냅샷_LOG는 삭제하지 않았습니다.");
}

function toDate_(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) return value;
  if (typeof value === "number") return serialToDate_(value);

  const text = String(value).trim();
  if (!text) return null;

  const d = new Date(text.replace(/\./g, "-").replace(/\//g, "-").replace("T", " "));
  return isNaN(d) ? null : d;
}

function getUsedRows_(sheet, colCount) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, colCount)
    .getDisplayValues()
    .filter(r => String(r.join("")).trim() !== "");
}


/****************************************************
 * EXTERNAL WEBSITE API HELPERS
 ****************************************************/

function getCustomerAnalysisWeb_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName(SHEET_RAW);
  if (!raw) return { customers: [] };

  const values = raw.getDataRange().getValues();
  const map = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const reqNo = String(row[1] || "").trim();           // B 출고요청번호
    const status = String(row[3] || "").trim();          // D 작업상태
    const customer = String(row[5] || "미지정").trim();  // F 고객사
    const product = String(row[7] || "").trim();         // H 출고 신청 상품
    const pcs = normalizeNumber_(row[8]);                // I 출고 신청 수량

    if (!customer || !status) continue;

    if (!map[customer]) {
      map[customer] = {
        customer: customer,
        total: 0,          // RAW 라인 수 기준
        request: 0,
        working: 0,
        done: 0,
        cancel: 0,
        remain: 0,
        pcs: 0,
        productLineCount: 0,
        orderMap: {}
      };
    }

    const x = map[customer];
    x.total += 1;
    x.pcs += pcs;

    // 평균 SKU 기준: 고객사별 출고 신청 상품 라인 수 ÷ 출고요청번호 수
    if (product) x.productLineCount += 1;

    const orderKey = reqNo || ("ROW_" + i);
    if (!x.orderMap[orderKey]) x.orderMap[orderKey] = true;

    if (status === "출고요청") {
      x.request += 1;
      x.remain += 1;
    } else if (status === "출고작업중") {
      x.working += 1;
      x.remain += 1;
    } else if (status === "출고완료") {
      x.done += 1;
    } else if (status === "출고요청취소") {
      x.cancel += 1;
    }
  }

  const customers = Object.keys(map).map(k => {
    const x = map[k];
    const base = x.done + x.remain;
    const orderCount = Object.keys(x.orderMap || {}).length || 1;

    x.orderCount = orderCount;
    x.avgSku = Number(x.productLineCount || 0) / orderCount;
    x.avgPcs = Number(x.pcs || 0) / orderCount;
    x.progress = base > 0 ? x.done / base : 0;

    delete x.orderMap;
    delete x.productLineCount;
    return x;
  }).sort((a, b) => b.remain - a.remain).slice(0, 30);

  return { customers: customers };
}

function askOutboundAiAnalysisWeb_(params) {
  const question = String(params.q || "").trim();

  const dashboard = safeJsonParse_(params.dashboard, {});
  const hourly = safeJsonParse_(params.hourly, []);
  const settings = safeJsonParse_(params.settings, {});
  const analysisRaw = safeJsonParse_(params.analysis, {});
  const analysis = analysisRaw.analysis || analysisRaw || {};
  const customers = analysisRaw.customers || [];

  const pulse = getPulseData();

  const context = {
    question: question,
    dashboard: Object.keys(dashboard).length ? dashboard : (pulse.dashboard || {}),
    hourly: Array.isArray(hourly) && hourly.length ? hourly : (pulse.hourly || []),
    settings: Object.keys(settings).length ? settings : (pulse.settings || {}),
    analysis: analysis,
    customers: customers,
    currentTime: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss")
  };

  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");

  if (!apiKey) {
    return {
      ok: true,
      answer: makeOutboundAiFallbackByContext_(context, "OPENAI_API_KEY 미설정")
    };
  }

  try {
    const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-4.1-mini";

    const payload = {
      model: model,
      input: [
        {
          role: "system",
          content:
            "너는 YK ANGELS PULSE의 JAVIS AI다. " +
            "물류센터 1센터 3층 출고 운영 보조 AI로 답한다. " +
            "잔업을 무조건 권장하지 말고, 잔업 최소화가 기본 원칙이다. " +
            "추가 인원 숫자를 비현실적으로 제시하지 말고 현재 시간당 처리량, 잔여량, 다음 타임 필요 처리량, 정규 종료 가능성을 중심으로 판단한다. " +
            "사용자가 일반 질문을 하면 기능 설명을 자연스럽게 답하고, 운영 질문이면 제공된 JSON 데이터 기준으로 답한다. " +
            "데이터에 없는 내용은 추측하지 않는다. 답변은 한국어로 짧고 현장 관리자 말투에 맞게 작성한다."
        },
        {
          role: "user",
          content:
            "질문:\n" + question +
            "\n\n현재 운영 데이터 JSON:\n" + JSON.stringify(context)
        }
      ],
      temperature: 0.3,
      max_output_tokens: 900
    };

    const res = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const status = res.getResponseCode();
    const body = res.getContentText();
    const json = JSON.parse(body);

    if (status >= 400) {
      const msg = json.error && json.error.message ? json.error.message : body;
      return {
        ok: true,
        answer: makeOutboundAiFallbackByContext_(context, "OpenAI 오류: " + msg)
      };
    }

    const answer = extractOpenAiText_(json);

return {
  ok: true,
  answer: cleanAiAnswer_(
    answer || makeOutboundAiFallbackByContext_(context, "OpenAI 응답 없음")
  )
};

  } catch (err) {
return {
  ok: true,
  answer: cleanAiAnswer_(
    makeOutboundAiFallbackByContext_(context, "AI 호출 실패: " + (err.message || err))
  )
};
  }
}

function makeOutboundAiFallback_(d, question, note) {
  const totalIn = d["총 인입"] || "0";
  const done = d["출고완료"] || "0";
  const remain = d["잔여"] || "0";
  const progress = d["진행률"] || "0%";
  const people = d["현재 출고 인원"] || "0";
  const prod = d["현재까지 평균 생산성"] || d["생산성"] || "0";
  const target = d["목표 생산성"] || "26";
  const risk = d["생산성 위험등급"] || "-";

  const prodNum = Number(String(prod).replace(/,/g, ""));
  const targetNum = Number(String(target).replace(/,/g, ""));
  const remainNum = Number(String(remain).replace(/,/g, ""));
  const peopleNum = Number(String(people).replace(/,/g, ""));

  let answer = "현재 출고 생산성 현황 기준으로 분석했습니다.\n\n";
  answer += "■ 현재 현황\n";
  answer += "- 총 인입: " + totalIn + "건\n";
  answer += "- 출고완료: " + done + "건\n";
  answer += "- 잔여: " + remain + "건\n";
  answer += "- 진행률: " + progress + "\n";
  answer += "- 현재 출고 인원: " + people + "명\n";
  answer += "- 현재까지 평균 생산성: " + prod + " / 목표 " + target + "\n";
  answer += "- 위험등급: " + risk + "\n\n";

  answer += "■ 판단\n";
  if (!peopleNum || !prodNum) {
    answer += "현재 인원 또는 생산성 값이 부족해 정확한 마감 예측은 어렵습니다. 출고 인원 설정과 시간대별 인원 변경 반영 여부를 확인해 주세요.\n";
  } else if (prodNum >= targetNum) {
    answer += "현재까지 평균 생산성이 목표 이상입니다. 현재 흐름이 유지되면 안정권입니다.\n";
  } else if (prodNum >= targetNum * 0.85) {
    answer += "현재까지 평균 생산성이 목표에 근접한 주의 구간입니다. 잔여가 많으면 30분~1시간 단위 보강을 검토하세요.\n";
  } else {
    answer += "현재까지 평균 생산성이 목표 대비 부족한 위험 구간입니다. 잔여가 계속 유지되면 인원 추가 또는 잔업 검토가 필요합니다.\n";
  }

  if (remainNum > 0 && prodNum > 0 && peopleNum > 0) {
    const hourlyCapacity = prodNum * peopleNum;
    const needHours = remainNum / hourlyCapacity;
    answer += "\n■ 단순 예상\n";
    answer += "- 현재 속도 기준 잔여 처리 예상 시간: 약 " + needHours.toFixed(1) + "시간\n";
  }

  answer += "\n질문: " + (question || "-");
  answer += "\n(" + note + ")";
  return answer;
}

function safeJsonParse_(text, fallback) {
  try {
    if (!text) return fallback;
    return JSON.parse(text);
  } catch (err) {
    return fallback;
  }
}

function extractOpenAiText_(json) {
  if (!json) return "";

  if (json.output_text) return String(json.output_text).trim();

  if (Array.isArray(json.output)) {
    const parts = [];

    json.output.forEach(item => {
      if (Array.isArray(item.content)) {
        item.content.forEach(c => {
          if (c.type === "output_text" && c.text) {
            parts.push(c.text);
          }
        });
      }
    });

    return parts.join("\n").trim();
  }

  return "";
}
function makeOutboundAiFallbackByContext_(context, note) {
  const d = context.dashboard || {};
  const a = context.analysis || {};
  const q = String(context.question || "");

  const remain = a.remain !== undefined ? a.remain : d["잔여"] || "0";
  const people = a.people !== undefined ? a.people : d["현재 출고 인원"] || "0";
  const prod = a.productivityText || d["현재 생산성"] || d["생산성"] || "0";
  const hourlyCapacity = a.hourlyCapacity || 0;
  const forecastCapacity = a.forecastCapacity || hourlyCapacity || 0;
  const regularEnd = a.regularEnd || "-";
  const finishTime = a.finishTime || "-";
  const decision = a.decision || d["생산성 위험등급"] || "-";
  const possibleRegular = a.possibleRegular || 0;
  const lackRegular = a.lackRegular || 0;
  const nextNeed = a.nextNeed !== undefined ? a.nextNeed : remain;
  const next30Need = a.next30Need !== undefined ? a.next30Need : nextNeed;

  if (q.includes("뭐할수") || q.includes("기능") || q.includes("뭐 할")) {
    return [
      "나는 JAVIS AI OT 분석 보조로 이런 걸 할 수 있어.",
      "",
      "1. 현재 출고 생산성 기준으로 정규 마감 가능 여부 판단",
      "2. 잔업 없이 끝내려면 다음 타임에 몇 건 처리해야 하는지 계산",
      "3. 현재 시간당 처리량과 최근 흐름 기준 예상 종료시간 계산",
      "4. 고객사별 잔여량을 보고 병목 고객사 확인",
      "5. 부장님/소장님 보고용 문구 작성",
      "6. 운영 설정, 인원 변경, 휴게시간 반영 여부 점검",
      "",
      "예를 들면 이렇게 물어보면 돼.",
      "- 오늘 잔업 필요해?",
      "- 다음 30분에 몇 건 처리해야 해?",
      "- 현재 속도로 몇 시에 끝나?",
      "- 보고용 문구로 정리해줘."
    ].join("\n");
  }

  return [
    "현재 데이터 기준으로 판단했습니다.",
    "",
    "■ 현재 현황",
    "- 잔여량: " + Number(remain || 0).toLocaleString() + "건",
    "- 출고 인원: " + people + "명",
    "- 현재 생산성: " + prod,
    "- 현재 시간당 처리량: " + Number(hourlyCapacity || 0).toLocaleString() + "건/h",
    "- 최근 흐름 반영 예측 처리량: " + Number(forecastCapacity || 0).toLocaleString() + "건/h",
    "- 정규 종료: " + regularEnd,
    "- 예상 종료: " + finishTime,
    "",
    "■ 판단",
    "- " + decision,
    "- 정규 종료까지 처리 가능: 약 " + Number(possibleRegular || 0).toLocaleString() + "건",
    "- 정규 종료까지 부족: 약 " + Number(lackRegular || 0).toLocaleString() + "건",
    "- 다음 타임 필요 처리량: " + Number(nextNeed || 0).toLocaleString() + "건",
    "- 다음 30분 집중 목표: 약 " + Number(next30Need || 0).toLocaleString() + "건",
    "",
    "※ " + note
  ].join("\n");
}

function cleanAiAnswer_(text) {
  text = String(text || "").trim();
  if (!text) return "";

  const lines = text
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  const result = [];
  const seen = {};

  lines.forEach(line => {
    const key = line.replace(/\s+/g, " ");
    if (!seen[key]) {
      seen[key] = true;
      result.push(line);
    }
  });

  return result.join("\n");
}

function findSettingRowByDate_(sheet, workDate) {
  const target = normalizeDateKey_(workDate);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    if (normalizeDateKey_(values[i][0]) === target) {
      return i + 2;
    }
  }

  return 0;
}

function ensureOutboundSettingForDate_(workDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const base = ss.getSheetByName(SHEET_SETTING);
  const rest = ss.getSheetByName(SHEET_BREAK);
  const hour = ss.getSheetByName(SHEET_HOUR_PEOPLE);

  const targetDate = normalizeDateKey_(workDate) || getWorkDate_();

  if (findSettingRowByDate_(base, targetDate)) {
    ensureBreakRowsForDate_(rest, targetDate);
    return;
  }

  const defaultRow = [
    targetDate, "YI03", 25,
    0, 0,
    "09:30", "18:30",
    "17:00", "02:00",
    "00:00", "00:00", ""
  ];

  const validPrev = getLastValidSettingRow_(base, targetDate);

  if (validPrev) {
    defaultRow[1] = validPrev[1] || "YI03";
    defaultRow[2] = validPrev[2] || 25;
defaultRow[3] = 0; // 주간출고인원은 매일 초기화
defaultRow[4] = 0; // 야간출고인원은 매일 초기화
    defaultRow[5] = normalizeShortTime_(validPrev[5] || "09:30");
    defaultRow[6] = normalizeShortTime_(validPrev[6] || "18:30");
    defaultRow[7] = normalizeShortTime_(validPrev[7] || "17:00");
    defaultRow[8] = normalizeShortTime_(validPrev[8] || "02:00");
  }

  // 잔업은 매일 초기화
  defaultRow[9] = "00:00";
  defaultRow[10] = "00:00";

  base.getRange(base.getLastRow() + 1, 1, 1, 12).setValues([defaultRow]);

  ensureBreakRowsForDate_(rest, targetDate);

  if (hour.getLastRow() < 1) {
    hour.getRange(1, 1, 1, 6).setValues([[
      "운영일", "시간대", "주간증감", "야간증감", "총증감", "메모"
    ]]);
  }
}

function getLastValidSettingRow_(sheet, targetDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, 12).getDisplayValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const r = values[i];
    const rowDate = normalizeDateKey_(r[0]);

    if (!rowDate || rowDate >= targetDate) continue;

    const dayStart = normalizeShortTime_(r[5]);
    const dayEnd = normalizeShortTime_(r[6]);
    const nightStart = normalizeShortTime_(r[7]);
    const nightEnd = normalizeShortTime_(r[8]);

    const isBroken =
      dayStart === "00:00" &&
      dayEnd === "00:00" &&
      nightStart === "00:00" &&
      nightEnd === "00:00";

    if (!isBroken) return r;
  }

  return null;
}

function ensureBreakRowsForDate_(sheet, workDate) {
  const exists = getRowsByWorkDate_(sheet, 7, workDate);
  if (exists.length > 0) return;

  // 새 운영일은 전날 식사/휴게 시간 구조만 복사한다.
  // 인원 변경 내역은 복사하지 않는다.
  const prevBreaks = getLastValidBreakRows_(sheet, workDate);
  const defaultBreaks = prevBreaks.length
    ? prevBreaks.map(r => [workDate, r[1], r[2], normalizeShortTime_(r[3]), normalizeShortTime_(r[4]), r[5] || "Y", r[6] || ""])
    : getDefaultBreakRowsByDate_(workDate);

  sheet.getRange(sheet.getLastRow() + 1, 1, defaultBreaks.length, 7)
    .setValues(defaultBreaks);

  sheet.getRange("A:A").setNumberFormat("@");
}

function getLastValidBreakRows_(sheet, targetDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
  const dates = values
    .map(r => normalizeDateKey_(r[0]))
    .filter(d => d && d < targetDate)
    .sort();

  if (!dates.length) return [];
  const lastDate = dates[dates.length - 1];
  return values.filter(r => normalizeDateKey_(r[0]) === lastDate);
}

function getDefaultBreakRowsByDate_(workDate) {
  const d = new Date(workDate + "T00:00:00");
  const day = d.getDay(); // 0 일, 6 토

  // 토요일
  if (day === 6) {
    return [
      [workDate, "주간", "식사", "12:30", "13:30", "Y", ""],
      [workDate, "주간", "휴게", "15:30", "15:50", "Y", ""],
      [workDate, "야간", "식사", "18:00", "19:00", "Y", ""],
      [workDate, "야간", "휴게", "21:00", "21:10", "Y", ""],
      [workDate, "야간", "휴게", "23:00", "23:10", "Y", ""]
    ];
  }

  // 월~금, 일 기본
  return [
    [workDate, "주간", "식사", "12:30", "13:30", "Y", ""],
    [workDate, "주간", "휴게", "15:30", "15:50", "Y", ""],
    [workDate, "야간", "식사", "19:00", "20:00", "Y", ""],
    [workDate, "야간", "휴게", "22:00", "22:10", "Y", ""],
    [workDate, "야간", "휴게", "00:00", "00:10", "Y", ""]
  ];
}

function getRowsByWorkDate_(sheet, colCount, workDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, colCount)
    .getDisplayValues()
    .filter(r => normalizeDateKey_(r[0]) === workDate);
}

function replaceRowsByWorkDate_(sheet, colCount, workDate, newRows) {
  const lastRow = sheet.getLastRow();
  const header = sheet.getRange(1, 1, 1, colCount).getValues();

  let oldRows = [];
  if (lastRow > 1) {
    oldRows = sheet
      .getRange(2, 1, lastRow - 1, colCount)
      .getValues()
      .filter(r => normalizeDateKey_(r[0]) !== workDate);
  }

  const merged = oldRows.concat(newRows || []);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, colCount).setValues(header);

  if (merged.length > 0) {
    sheet.getRange(2, 1, merged.length, colCount).setValues(merged);
  }

  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight("bold")
    .setBackground("#123b7a")
    .setFontColor("#ffffff");

  sheet.setFrozenRows(1);
}