import { addMinutesToTime, displayProd, minutesToHHMM, num } from "./api";

export function riskClass(risk) {
  const x = String(risk || "");
  if (x.includes("안정")) return "safe";
  if (x.includes("주의")) return "warn";
  if (x.includes("위험")) return "danger";
  return "";
}

function parseWorkTime(workDate, timeText) {
  const m = String(timeText || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m || !workDate) return null;

  let h = Number(m[1]);
  const min = Number(m[2]);
  const d = new Date(`${workDate}T00:00:00`);

  if (h >= 24) {
    d.setDate(d.getDate() + 1);
    h -= 24;
  } else if (h < 8) {
    d.setDate(d.getDate() + 1);
  }

  d.setHours(h, min, 0, 0);
  return d;
}

function getLocalWorkDate(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 8) d.setDate(d.getDate() - 1);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function overtimeMinutes(v) {
  const m = String(v || "00:00").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function shiftEndWithOt(workDate, endText, otText) {
  const end = parseWorkTime(workDate, endText);
  if (!end) return null;
  const ot = overtimeMinutes(otText || "00:00");
  return new Date(end.getTime() + ot * 60000);
}

function breakRange(workDate, shift, startText, endText, settings) {
  let st = parseWorkTime(workDate, startText);
  let ed = parseWorkTime(workDate, endText);
  if (!st || !ed) return null;
  if (ed <= st) ed.setDate(ed.getDate() + 1);

  if (shift === "야간") {
    const b = settings?.base || {};
    const ns = parseWorkTime(workDate, b.nightStart || "17:00");
    const ne = shiftEndWithOt(workDate, b.nightEnd || "02:00", b.nightOvertime || "00:00");

    if (ns && ne && st < ns) {
      const mst = new Date(st);
      const med = new Date(ed);
      mst.setDate(mst.getDate() + 1);
      med.setDate(med.getDate() + 1);

      if (mst >= ns && mst <= ne) {
        st = mst;
        ed = med;
      }
    }
  }

  return { start: st, end: ed };
}

function breakOverlapMinutes(breaks, start, end, settings) {
  if (!start || !end || end <= start) return 0;

  let total = 0;

  for (const r of breaks || []) {
    const deduct = String(r[5] || "").toUpperCase();
    if (deduct !== "Y") continue;

    const workDate = r[0];
    const shift = String(r[1] || "");
    const range = breakRange(workDate, shift, r[3], r[4], settings);
    if (!range) continue;

    const s = Math.max(start.getTime(), range.start.getTime());
    const e = Math.min(end.getTime(), range.end.getTime());

    if (e > s) total += (e - s) / 60000;
  }

  return total;
}

function chooseActiveShift(settings, now) {
  const b = settings?.base || {};
  const workDate = b.workDate || getLocalWorkDate(now);

  const dayStart = parseWorkTime(workDate, b.dayStart || "09:30");
  const dayEnd = shiftEndWithOt(workDate, b.dayEnd || "18:30", b.dayOvertime || "00:00");
  const nightStart = parseWorkTime(workDate, b.nightStart || "17:00");
  const nightEnd = shiftEndWithOt(workDate, b.nightEnd || "02:00", b.nightOvertime || "00:00");

  if (dayStart && dayEnd && now >= dayStart && now <= dayEnd) {
    return { name: "주간", start: dayStart, end: dayEnd, baseEnd: parseWorkTime(workDate, b.dayEnd || "18:30"), people: num(b.dayPeople), ended: false };
  }

  if (nightStart && nightEnd && now >= nightStart && now <= nightEnd) {
    return { name: "야간", start: nightStart, end: nightEnd, baseEnd: parseWorkTime(workDate, b.nightEnd || "02:00"), people: num(b.nightPeople), ended: false };
  }

  if (nightEnd && now > nightEnd) {
    return { name: "센터 운영 종료", start: nightStart, end: nightEnd, baseEnd: nightEnd, people: 0, ended: true };
  }

  if (dayEnd && now > dayEnd && nightStart && now < nightStart) {
    return { name: "교대 대기", start: dayStart, end: dayEnd, baseEnd: dayEnd, people: 0, ended: true };
  }

  return { name: "운영 전", start: dayStart, end: dayEnd, baseEnd: dayEnd, people: 0, ended: true };
}

function latestHourlyCapacity(hourly = [], fallbackCapacity = 0) {
  const rows = [...hourly].filter((r) => num(r["시간당 완료"]) > 0 || num(r["생산성"]) > 0);
  const last = rows[rows.length - 1];
  if (!last) return fallbackCapacity;

  const done = num(last["시간당 완료"]);
  if (done > 0) return done;

  const p = num(last["생산성"]);
  const people = num(last["출고인원"]);
  if (p > 0 && people > 0) return p * people;

  return fallbackCapacity;
}

function recentAverageHourlyCapacity(hourly = [], fallbackCapacity = 0) {
  const rows = [...hourly]
    .filter((r) => num(r["시간당 완료"]) > 0 || (num(r["생산성"]) > 0 && num(r["출고인원"]) > 0))
    .slice(-3);

  if (!rows.length) return fallbackCapacity;

  const caps = rows.map((r) => {
    const done = num(r["시간당 완료"]);
    if (done > 0) return done;
    return num(r["생산성"]) * num(r["출고인원"]);
  });

  return caps.reduce((a, b) => a + b, 0) / caps.length;
}

export function analyzeOt(dashboard = {}, hourly = [], customers = [], settings = {}) {
  const now = new Date();
  const b = settings?.base || {};
  const breaks = settings?.breaks || [];
  const workDate = dashboard["운영일"] || b.workDate || getLocalWorkDate(now);

  const remain = num(dashboard["잔여"]);
  const peopleNow = num(dashboard["현재 출고 인원"]);
  const productivity = num(dashboard["현재 생산성"] || dashboard["생산성"]);
  const avgProductivity = num(dashboard["평균 생산성"] || dashboard["현재까지 평균 생산성"] || productivity);
  const target = num(dashboard["목표 생산성"] || b.targetProductivity || 25);
  const risk = dashboard["생산성 위험등급"] || "-";

  const active = chooseActiveShift({ ...settings, base: { ...b, workDate } }, now);
    if (active.ended) {
    const remain = num(dashboard["잔여"]);
    return {
      now: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      shift: active.name,
      workDate,
      remain,
      people: 0,
      productivity,
      productivityText: displayProd(productivity),
      avgProductivity,
      avgProductivityText: displayProd(avgProductivity),
      target,
      risk,
      regularEnd: active.baseEnd ? active.baseEnd.toTimeString().slice(0, 5) : "-",
      maxEnd: active.end ? active.end.toTimeString().slice(0, 5) : "-",
      minutesToRegular: 0,
      minutesToMax: 0,
      hourlyCapacity: 0,
      lastHourCapacity: 0,
      recentAvgCapacity: 0,
      forecastCapacity: 0,
      possibleRegular: 0,
      possibleMax: 0,
      lackRegular: remain,
      lackMax: remain,
      finishTime: "-",
      finishDuration: "00:00",
      nextNeed: remain,
      next30Need: remain,
      nextHourNeed: remain,
      decision: remain > 0 ? "센터 운영 종료 / 잔여 확인 필요" : "센터 운영 종료 / 잔여 없음",
      report: remain > 0
        ? `센터 운영시간이 종료되었습니다.\n현재 잔여는 ${remain.toLocaleString()}건입니다.\n지금은 잔업 판단이 아니라 미처리 잔여 확인 및 익일 처리 이월 기준으로 봐야 합니다.`
        : `센터 운영시간이 종료되었습니다.\n현재 잔여는 없습니다.`,
      canFinishRegular: false,
      canFinishMax: false,
      topCustomers: [],
    };
  }
  const regularEnd = active.baseEnd || active.end;
  const maxEnd = active.end || regularEnd;

  const minutesToRegularRaw = regularEnd ? Math.max(0, (regularEnd - now) / 60000) : 0;
  const minutesToMaxRaw = maxEnd ? Math.max(0, (maxEnd - now) / 60000) : 0;

  const regularBreak = breakOverlapMinutes(breaks, now, regularEnd, settings);
  const maxBreak = breakOverlapMinutes(breaks, now, maxEnd, settings);

  const minutesToRegular = Math.max(0, minutesToRegularRaw - regularBreak);
  const minutesToMax = Math.max(0, minutesToMaxRaw - maxBreak);

  const baseCapacity = peopleNow * productivity;
  const currentHourlyCapacity = Math.round(baseCapacity);
  const lastHourCapacity = Math.round(latestHourlyCapacity(hourly, baseCapacity));
  const recentAvgCapacity = Math.round(recentAverageHourlyCapacity(hourly, baseCapacity));

  const forecastCapacity = Math.max(0, Math.round((currentHourlyCapacity * 0.5) + (recentAvgCapacity * 0.5)));

  const possibleRegular = Math.floor(forecastCapacity * (minutesToRegular / 60));
  const possibleMax = Math.floor(forecastCapacity * (minutesToMax / 60));

  const lackRegular = Math.max(0, remain - possibleRegular);
  const lackMax = Math.max(0, remain - possibleMax);

  const finishMinutes = forecastCapacity > 0 ? (remain / forecastCapacity) * 60 : 0;
  const finishTime = forecastCapacity > 0 ? addMinutesToTime(now, finishMinutes) : "-";

  // 다음 타임 목표는 잔여 전체가 아니라 실제 30분/1시간 처리 가능량 기준으로 산정합니다.
  // 잔여가 많을 때 “다음 타임 800건 처리”처럼 비현실적인 문구가 나오지 않게 방어합니다.
  const next30Need = Math.min(remain, Math.max(0, Math.ceil(forecastCapacity * 0.5)));
  const nextHourNeed = Math.min(remain, Math.max(0, Math.ceil(forecastCapacity)));
  const nextNeed = next30Need;
  const next30Low = Math.min(remain, Math.max(0, Math.floor(next30Need * 0.9)));
  const next30High = Math.min(remain, Math.max(next30Need, Math.ceil(next30Need * 1.1)));

  let decision = "데이터 확인 필요";

  if (!peopleNow || !productivity || !forecastCapacity) {
    decision = "데이터 확인 필요";
  } else if (remain <= possibleRegular) {
    decision = "잔업 없이 가능";
  } else if (minutesToRegular <= 10) {
    decision = "다음 타임 집중 처리 필요";
  } else if (lackRegular > 0 && remain <= possibleMax) {
    decision = "잔업 최소화 관리 필요";
  } else {
    decision = "정규 종료 내 마감 어려움";
  }

  const topCustomers = [...(customers || [])]
    .sort((a, b) => num(b.remain) - num(a.remain))
    .slice(0, 5);

  const report = [
    `현재 출고 인원은 ${peopleNow}명, 현재 생산성은 ${displayProd(productivity)}입니다.`,
    `현재 시간당 처리량은 약 ${currentHourlyCapacity.toLocaleString()}건/h, 최근 흐름 반영 예측 처리량은 약 ${forecastCapacity.toLocaleString()}건/h입니다.`,
    `잔여량은 ${remain.toLocaleString()}건이며, 현재 흐름 기준 예상 종료시간은 ${finishTime}입니다.`,
    `${active.name || "현재"}조 정규 종료시간은 ${regularEnd ? regularEnd.toTimeString().slice(0, 5) : "-"}입니다.`,
    `정규 종료까지 처리 가능량은 약 ${possibleRegular.toLocaleString()}건, 부족량은 약 ${lackRegular.toLocaleString()}건입니다.`,
    `잔업을 안 하는 것이 우선이므로, 추가 인원 숫자보다 다음 타임 필요 처리량 기준으로 관리하는 것이 맞습니다.`,
    `다음 타임 목표는 잔여 전체가 아니라 30분 단위 실처리 기준입니다.`,
    `다음 30분 현실 목표는 약 ${next30Low.toLocaleString()}~${next30High.toLocaleString()}건, 다음 1시간 기준 목표는 약 ${nextHourNeed.toLocaleString()}건입니다.`,
  ].join("\n");

  return {
    now: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    shift: active.name || "-",
    workDate,
    remain,
    people: peopleNow,
    productivity,
    productivityText: displayProd(productivity),
    avgProductivity,
    avgProductivityText: displayProd(avgProductivity),
    target,
    risk,
    regularEnd: regularEnd ? regularEnd.toTimeString().slice(0, 5) : "-",
    maxEnd: maxEnd ? maxEnd.toTimeString().slice(0, 5) : "-",
    minutesToRegular,
    minutesToMax,
    hourlyCapacity: currentHourlyCapacity,
    lastHourCapacity,
    recentAvgCapacity,
    forecastCapacity,
    possibleRegular,
    possibleMax,
    lackRegular,
    lackMax,
    finishTime,
    finishDuration: minutesToHHMM(finishMinutes),
    nextNeed,
    next30Need,
    nextHourNeed,
    next30Low,
    next30High,
    decision,
    report,
    canFinishRegular: remain <= possibleRegular,
    canFinishMax: remain <= possibleMax,
    topCustomers,
  };
}

export function makeFallbackOtComment(dashboard = {}, hourly = [], customers = [], settings = {}) {
  const a = analyzeOt(dashboard, hourly, customers, settings);

  if (!a.people || !a.productivity) {
    return "현재 생산성 또는 출고 인원이 미집계 상태입니다. 설정과 스냅샷 갱신 여부를 먼저 확인해야 합니다.";
  }

  if (a.canFinishRegular) {
    return `현재 인원 ${a.people}명, 생산성 ${a.productivityText} 기준 정규 종료 전 마감 가능성이 있습니다. 예상 종료시간은 ${a.finishTime}입니다.`;
  }

  return `현재 인원 ${a.people}명, 생산성 ${a.productivityText} 기준 정규 종료 내 마감은 불안정합니다. 추가 인원 숫자보다 현재 시간당 처리량 ${a.hourlyCapacity.toLocaleString()}건/h와 다음 30분 목표 ${(a.next30Low || 0).toLocaleString()}~${(a.next30High || a.next30Need || 0).toLocaleString()}건 기준으로 관리하는 것이 현실적입니다.`;
}

export function makeLocalAiAnswer(question = "", analysis = {}, dashboard = {}, hourly = [], customers = [], settings = {}) {
  const q = String(question || "");

  if (!analysis || !analysis.remain) {
    analysis = analyzeOt(dashboard, hourly, customers, settings);
  }

  const base = `현재 데이터 기준으로 판단했습니다.

■ 현재 현황
- 잔여량: ${analysis.remain.toLocaleString()}건
- 출고 인원: ${analysis.people}명
- 현재 생산성: ${analysis.productivityText}
- 현재 시간당 처리량: ${analysis.hourlyCapacity.toLocaleString()}건/h
- 최근 흐름 반영 예측 처리량: ${analysis.forecastCapacity.toLocaleString()}건/h
- 정규 종료: ${analysis.regularEnd}
- 예상 종료: ${analysis.finishTime}

■ 판단
- ${analysis.decision}
- 정규 종료까지 처리 가능: 약 ${analysis.possibleRegular.toLocaleString()}건
- 정규 종료까지 부족: 약 ${analysis.lackRegular.toLocaleString()}건
- 다음 30분 현실 목표: 약 ${(analysis.next30Low || 0).toLocaleString()}~${(analysis.next30High || analysis.next30Need || 0).toLocaleString()}건
- 다음 1시간 목표: 약 ${analysis.nextHourNeed.toLocaleString()}건`;

  if (q.includes("보고") || q.includes("부장")) {
    return `[보고용]
현재 출고 잔여는 ${analysis.remain.toLocaleString()}건이며, 현재 시간당 처리량은 약 ${analysis.hourlyCapacity.toLocaleString()}건입니다.
현재 흐름 기준 예상 종료시간은 ${analysis.finishTime}으로 확인됩니다.
잔업을 최소화하기 위해 다음 30분은 약 ${(analysis.next30Low || 0).toLocaleString()}~${(analysis.next30High || analysis.next30Need || 0).toLocaleString()}건 처리 흐름을 기준으로 운영하겠습니다.`;
  }

  if (q.includes("잔업")) {
    return `${base}

잔업은 최후 기준으로 보는 게 맞습니다.
현재는 추가 인원 ${analysis.addPeopleRegular || 0}명 같은 비현실적인 숫자보다, 다음 30분/1시간 처리 목표를 잡고 마감 가능성을 다시 보는 방식이 더 적합합니다.`;
  }

  if (q.includes("다음") || q.includes("처리")) {
    return `${base}

다음 타임은 잔여 전체를 한 번에 처리하는 기준이 아닙니다.
다음 30분 현실 목표는 약 ${(analysis.next30Low || 0).toLocaleString()}~${(analysis.next30High || analysis.next30Need || 0).toLocaleString()}건이고, 다음 1시간은 약 ${analysis.nextHourNeed.toLocaleString()}건 처리 흐름을 보면 됩니다.`;
  }

  return base;
}