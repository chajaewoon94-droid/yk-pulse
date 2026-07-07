import { useEffect, useState } from "react";
import {
  DEFAULT_API_URL,
  getApiUrl,
  getViewMode,
  jsonp,
  resetApiUrl,
  saveApiUrl,
  saveViewMode,
} from "../utils/api";

const overtimeOptions = [
  { value: "00:00", label: "잔업 없음" },
  { value: "00:30", label: "30분" },
  { value: "01:00", label: "1시간" },
  { value: "01:30", label: "1시간 30분" },
  { value: "02:00", label: "2시간" },
  { value: "02:30", label: "2시간 30분" },
  { value: "03:00", label: "3시간" },
  { value: "03:30", label: "3시간 30분" },
];

function todayWorkDate() {
  const d = new Date();
  if (d.getHours() < 8) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeSignedNumber(v) {
  const text = String(v ?? "").replace(/[^0-9-]/g, "");
  if (text === "" || text === "-") return text;
  const n = Number(text);
  return Number.isNaN(n) ? 0 : n;
}

function normalizeSettings(s) {
  const b = s?.base || {};
  return {
    base: {
      workDate: b.workDate || todayWorkDate(),
      center: b.center || "YI03",
      targetProductivity: b.targetProductivity || 25,
      dayPeople: Number(b.dayPeople || 0),
      nightPeople: Number(b.nightPeople || 0),
      dayStart: b.dayStart || "09:00",
      dayEnd: b.dayEnd || "18:00",
      nightStart: b.nightStart || "17:00",
      nightEnd: b.nightEnd || "02:00",
      dayOvertime: b.dayOvertime || "00:00",
      nightOvertime: b.nightOvertime || "00:00",
      memo: b.memo || "",
    },
    breaks: Array.isArray(s?.breaks)
      ? s.breaks.filter((r) => String((r || []).join("")).trim())
      : [],
    hourlyPeople: Array.isArray(s?.hourlyPeople)
      ? s.hourlyPeople.filter((r) => String((r || []).join("")).trim())
      : [],
  };
}

function CountBox({ label, value, setValue }) {
  function toNumber(v) {
    const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
    return Number.isNaN(n) ? 0 : Math.max(0, n);
  }

  function change(diff) {
    setValue(Math.max(0, toNumber(value) + diff));
  }

  function handleInput(e) {
    const raw = e.target.value;

    // 모바일 숫자 키패드에서 입력 중인 값이 바로 state에 반영되도록 처리
    if (raw === "") {
      setValue("");
      return;
    }

    setValue(toNumber(raw));
  }

  function handleBlur(e) {
    const raw = e.target.value;
    setValue(raw === "" ? 0 : toNumber(raw));
  }

  return (
    <label>
      {label}
      <div className="count-box">
        <button type="button" onClick={() => change(-1)}>－</button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value ?? ""}
          onChange={handleInput}
          onBlur={handleBlur}
        />
        <button type="button" onClick={() => change(1)}>＋</button>
      </div>
    </label>
  );
}

function SignedNumberInput({ value, onChange }) {
  function toSigned(v) {
    const normalized = normalizeSignedNumber(v);
    if (normalized === "" || normalized === "-") return normalized;
    const n = Number(normalized);
    return Number.isNaN(n) ? 0 : n;
  }

  function numericValue() {
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }

  return (
    <div className="signed-box">
      <button type="button" onClick={() => onChange(numericValue() - 1)}>－</button>
      <input
        type="text"
        inputMode="text"
        value={value ?? ""}
        onChange={(e) => onChange(toSigned(e.target.value))}
        onBlur={(e) => {
          const v = toSigned(e.target.value);
          onChange(v === "" || v === "-" ? 0 : Number(v));
        }}
      />
      <button type="button" onClick={() => onChange(numericValue() + 1)}>＋</button>
    </div>
  );
}

export default function SettingsModal({
  open,
  onClose,
  setMessage,
  reload,
  initialSettings = {},
}) {
  const [pin, setPin] = useState("");
  const [passed, setPassed] = useState(() => sessionStorage.getItem("YK_PULSE_ADMIN_OK") === "Y");
  const [tab, setTab] = useState("operation");
  const [apiUrl, setApiUrl] = useState(getApiUrl());
  const [mode, setMode] = useState(getViewMode());
  const [settings, setSettings] = useState(normalizeSettings({}));
  const [saving, setSaving] = useState(false);
  const [newChange, setNewChange] = useState({
    date: "",
    time: "00:00",
    dayDiff: 0,
    nightDiff: 0,
    memo: "",
  });

  useEffect(() => {
    if (!open) return;

    const adminOk = sessionStorage.getItem("YK_PULSE_ADMIN_OK") === "Y";
    const next = normalizeSettings(initialSettings);
    setPin("");
    setPassed(adminOk);
    setTab("operation");
    setApiUrl(getApiUrl());
    setMode(getViewMode());
    setSettings(next);
    setNewChange((prev) => ({
      ...prev,
      date: next.base.workDate || todayWorkDate(),
    }));

    // 모바일 Safari/브라우저 캐시에서 예전 initialSettings가 남는 경우가 있어
    // 설정창을 열 때마다 Apps Script 기준 최신 운영일/설정을 다시 가져온다.
    if (adminOk) {
      jsonp("pulse", { t: Date.now() })
        .then((res) => {
          const latest = normalizeSettings(res?.settings || next);
          setSettings(latest);
          setNewChange((prev) => ({
            ...prev,
            date: latest.base.workDate || todayWorkDate(),
          }));
        })
        .catch(() => {});
    }
  }, [open, initialSettings]);

  if (!open) return null;

  function closeModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPin("");
    setPassed(sessionStorage.getItem("YK_PULSE_ADMIN_OK") === "Y");
    onClose?.();
  }

  function setBase(key, value) {
    setSettings((prev) => ({
      ...prev,
      base: { ...prev.base, [key]: value },
    }));
  }

  async function fetchLatestSettings() {
    try {
      const res = await jsonp("pulse", { t: Date.now() });
      const latest = normalizeSettings(res?.settings || initialSettings || {});
      setSettings(latest);
      setNewChange((prev) => ({
        ...prev,
        date: latest.base.workDate || todayWorkDate(),
      }));
      return latest;
    } catch (e) {
      const fallback = normalizeSettings(initialSettings || settings || {});
      setSettings(fallback);
      setNewChange((prev) => ({
        ...prev,
        date: fallback.base.workDate || todayWorkDate(),
      }));
      return fallback;
    }
  }

  async function checkPin() {
    if (pin !== "1531") {
      setMessage?.({
        type: "warn",
        title: "비밀번호 확인",
        text: "비밀번호가 맞지 않습니다.",
      });
      return;
    }

    sessionStorage.setItem("YK_PULSE_ADMIN_OK", "Y");
    setPassed(true);
    await fetchLatestSettings();
  }

  async function saveOperation() {
  try {
    setSaving(true);

    // 저장 직전에 숫자값을 강제로 정리해서 모바일 입력값 누락 방지
    const payload = normalizeSettings({
      ...settings,
      base: {
        ...settings.base,
        targetProductivity: Number(settings.base.targetProductivity || 25),
        dayPeople: Number(settings.base.dayPeople || 0),
        nightPeople: Number(settings.base.nightPeople || 0),
      },
    });

    const res = await jsonp("saveSettings", {
      data: JSON.stringify(payload),
      t: Date.now(),
    });

    if (res?.ok === false) {
      throw new Error(res.error || "저장 실패");
    }

    setSettings(payload);
    await reload?.();

    setMessage?.({
      title: "운영 설정 저장 완료",
      text: "설정이 저장되었습니다. PC/모바일 모두 최신 설정으로 다시 불러왔습니다.",
    });

    closeModal();
  } catch (e) {
    setMessage?.({
      type: "warn",
      title: "저장 실패",
      text: e?.message || String(e),
    });
  } finally {
    setSaving(false);
  }
}

function saveSystem() {
  saveApiUrl(apiUrl);
  saveViewMode(mode);

  setMessage?.({
    title: "시스템 설정 저장 완료",
    text: "설정이 저장되었습니다. 앱을 다시 불러옵니다.",
  });

  setTimeout(() => {
    window.location.reload();
  }, 500);
}

function resetSystem() {
  resetApiUrl();
  saveViewMode("auto");
  setApiUrl(DEFAULT_API_URL);
  setMode("auto");

  setMessage?.({
    title: "초기화 완료",
    text: "API URL과 화면 모드가 기본값으로 초기화되었습니다. 앱을 다시 불러옵니다.",
  });

  setTimeout(() => {
    window.location.reload();
  }, 500);
}

  function addBreak() {
    const workDate = settings.base.workDate || "";
    setSettings((prev) => ({
      ...prev,
      breaks: [...prev.breaks, [workDate, "야간", "식사", "19:00", "20:00", "Y", ""]],
    }));
  }

  function updateBreak(idx, col, value) {
    setSettings((prev) => ({
      ...prev,
      breaks: prev.breaks.map((r, i) =>
        i === idx ? r.map((v, c) => (c === col ? value : v)) : r
      ),
    }));
  }

  function deleteBreak(idx) {
    setSettings((prev) => ({
      ...prev,
      breaks: prev.breaks.filter((_, i) => i !== idx),
    }));
  }

  function addPeopleChange() {
    const workDate = newChange.date || settings.base.workDate || todayWorkDate();
    const dayDiff = Number(newChange.dayDiff || 0);
    const nightDiff = Number(newChange.nightDiff || 0);
    const totalDiff = dayDiff + nightDiff;

    const row = [
      workDate,
      `${workDate} ${newChange.time || "00:00"}`,
      String(dayDiff),
      String(nightDiff),
      String(totalDiff),
      newChange.memo || "",
    ];

    if (!row[0] || !newChange.time) {
      setMessage?.({
        type: "warn",
        title: "입력 확인",
        text: "운영일과 적용시간을 입력해주세요.",
      });
      return;
    }

    setSettings((prev) => ({
      ...prev,
      hourlyPeople: [...prev.hourlyPeople, row].sort((a, b) =>
        String(a[1]).localeCompare(String(b[1]))
      ),
    }));

    setNewChange((prev) => ({
      ...prev,
      dayDiff: 0,
      nightDiff: 0,
      memo: "",
    }));
  }

  function removePeopleChange(idx) {
    setSettings((prev) => ({
      ...prev,
      hourlyPeople: prev.hourlyPeople.filter((_, i) => i !== idx),
    }));
  }

  return (
    <div className="modal">
      {!passed ? (
        <div className="password-card">
          <div className="auth-topline" />
          <div className="password-head">
            <div className="password-badge">YK</div>
            <div className="password-title">
              <h2>관리자 권한 확인</h2>
              <p>운영 설정과 시스템 설정은 관리자 인증 후 변경할 수 있습니다.</p>
            </div>
          </div>

          <div className="auth-panel">
            <div className="pin-label">
              <span>관리자 PIN</span>
              <span>비공개 입력</span>
            </div>
            <input
              type="password"
              maxLength="4"
              inputMode="numeric"
              placeholder="4자리 PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && checkPin()}
              autoFocus
            />
          </div>

          <div className="password-actions">
            <button type="button" onClick={checkPin}>설정 열기</button>
            <button type="button" className="gray" onClick={closeModal}>닫기</button>
          </div>
        </div>
      ) : (
        <div className="setting-card restored">
          <div className="setting-head no-top-close">
            <div>
              <h2>관리자 설정</h2>
              <p className="setting-sub">
                기존 관리자 설정 화면을 복구했습니다. 센터 운영시간, 출고 인원, 식사/휴게시간, 시간대 인원 변경을 관리합니다.
              </p>
            </div>
          </div>

          <div className="settings-tabs">
            <button type="button" className={tab === "operation" ? "active" : ""} onClick={() => setTab("operation")}>출고 운영 설정</button>
            <button type="button" className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>시간대 인원</button>
            <button type="button" className={tab === "system" ? "active" : ""} onClick={() => setTab("system")}>시스템 설정</button>
          </div>

          {tab === "operation" && (
            <>
              <div className="settings-section-title">
                <h3>기본 운영 설정</h3>
                <p>최대 종료시간은 잔업 설정이 있을 때만 계산됩니다. 잔업이 00:00이면 주간/야간 종료시간을 그대로 사용합니다.</p>
              </div>

              <div className="setting-grid">
                <label>운영일<input type="date" value={settings.base.workDate} onChange={(e) => setBase("workDate", e.target.value)} /></label>
                <label>센터<input value={settings.base.center} onChange={(e) => setBase("center", e.target.value)} /></label>
                <label>목표 생산성<input type="number" value={settings.base.targetProductivity} onChange={(e) => setBase("targetProductivity", e.target.value)} /></label>

                <CountBox label="주간 출고 인원" value={settings.base.dayPeople} setValue={(v) => setBase("dayPeople", v)} />
                <CountBox label="야간 출고 인원" value={settings.base.nightPeople} setValue={(v) => setBase("nightPeople", v)} />
                <label>메모<input value={settings.base.memo} onChange={(e) => setBase("memo", e.target.value)} /></label>

                <label>주간 시작<input value={settings.base.dayStart} onChange={(e) => setBase("dayStart", e.target.value)} /></label>
                <label>주간 종료<input value={settings.base.dayEnd} onChange={(e) => setBase("dayEnd", e.target.value)} /></label>
                <label>주간 잔업
                  <select value={settings.base.dayOvertime} onChange={(e) => setBase("dayOvertime", e.target.value)}>
                    {overtimeOptions.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                </label>

                <label>야간 시작<input value={settings.base.nightStart} onChange={(e) => setBase("nightStart", e.target.value)} /></label>
                <label>야간 종료<input value={settings.base.nightEnd} onChange={(e) => setBase("nightEnd", e.target.value)} /></label>
                <label>야간 잔업
                  <select value={settings.base.nightOvertime} onChange={(e) => setBase("nightOvertime", e.target.value)}>
                    {overtimeOptions.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="section-lite">
                <div className="section-title mini">
                  <span>식사 / 휴게시간</span>
                  <button type="button" className="add-mini-btn" onClick={addBreak}>+ 추가</button>
                </div>

                <div className="break-list">
                  {settings.breaks.length === 0 && <div className="empty">등록된 식사/휴게시간이 없습니다.</div>}
                  {settings.breaks.map((r, i) => (
                    <div className="break-row" key={`${r[0]}-${r[3]}-${i}`}>
                      <input value={r[0] || ""} onChange={(e) => updateBreak(i, 0, e.target.value)} placeholder="운영일" />
                      <select value={r[1] || "주간"} onChange={(e) => updateBreak(i, 1, e.target.value)}>
                        <option>주간</option>
                        <option>야간</option>
                      </select>
                      <select value={r[2] || "휴게"} onChange={(e) => updateBreak(i, 2, e.target.value)}>
                        <option>식사</option>
                        <option>휴게</option>
                      </select>
                      <input value={r[3] || ""} onChange={(e) => updateBreak(i, 3, e.target.value)} placeholder="시작" />
                      <input value={r[4] || ""} onChange={(e) => updateBreak(i, 4, e.target.value)} placeholder="종료" />
                      <select value={r[5] || "Y"} onChange={(e) => updateBreak(i, 5, e.target.value)}>
                        <option>Y</option>
                        <option>N</option>
                      </select>
                      <input value={r[6] || ""} onChange={(e) => updateBreak(i, 6, e.target.value)} placeholder="메모" />
                      <button type="button" className="delete-break-btn" onClick={() => deleteBreak(i)}>
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="setting-actions">
                <button type="button" onClick={saveOperation} disabled={saving}>{saving ? "저장 중..." : "운영 설정 저장"}</button>
                <button type="button" className="gray" onClick={closeModal}>닫기</button>
              </div>
            </>
          )}

          {tab === "people" && (
            <>
              <div className="settings-section-title">
                <h3>시간대 인원 변경</h3>
                <p>특정 시간부터 출고 인원이 증감되는 경우 등록합니다.</p>
              </div>

              <div className="people-editor">
                <label>운영일<input type="date" value={newChange.date} onChange={(e) => setNewChange((p) => ({ ...p, date: e.target.value }))} /></label>
                <label>적용시간<input value={newChange.time} onChange={(e) => setNewChange((p) => ({ ...p, time: e.target.value }))} placeholder="21:30" /></label>
                <label>주간증감<SignedNumberInput value={newChange.dayDiff} onChange={(v) => setNewChange((p) => ({ ...p, dayDiff: v }))} /></label>
                <label>야간증감<SignedNumberInput value={newChange.nightDiff} onChange={(v) => setNewChange((p) => ({ ...p, nightDiff: v }))} /></label>
                <label>총증감
                  <input
                    value={Number(newChange.dayDiff || 0) + Number(newChange.nightDiff || 0)}
                    readOnly
                    className="readonly-input"
                  />
                </label>
                <label>메모<input value={newChange.memo} onChange={(e) => setNewChange((p) => ({ ...p, memo: e.target.value }))} placeholder="예: 출고 지원 1명 추가" /></label>
                <button type="button" onClick={addPeopleChange}>+ 인원 변경 추가</button>
              </div>

              <div className="change-list">
                {settings.hourlyPeople.length === 0 && <div className="empty">등록된 시간대 인원 변경이 없습니다.</div>}
                {settings.hourlyPeople.map((r, i) => (
                  <div className="change-item" key={`${r[1]}-${i}`}>
                    <div><b>{r[0]}</b><span>{r[1]}</span></div>
                    <div className="pill">주간 {r[2] || 0}</div>
                    <div className="pill">야간 {r[3] || 0}</div>
                    <div className="pill plus">총 {r[4] || 0}</div>
                    <div className="change-memo">{r[5] || "-"}</div>
                    <button className="delete-mini" type="button" onClick={() => removePeopleChange(i)}>삭제</button>
                  </div>
                ))}
              </div>

              <div className="setting-actions">
                <button type="button" onClick={saveOperation} disabled={saving}>{saving ? "저장 중..." : "인원 설정 저장"}</button>
                <button type="button" className="gray" onClick={closeModal}>닫기</button>
              </div>
            </>
          )}

          {tab === "system" && (
            <>
              <div className="settings-section-title">
                <h3>시스템 설정</h3>
                <p>Apps Script 배포 URL, 화면 모드, 버전 정보입니다.</p>
              </div>

              <div className="setting-grid">
                <label className="wide">Apps Script API URL<input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} /></label>
                <label>화면 모드
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="auto">자동</option>
                    <option value="pc">PC 모드</option>
                    <option value="mobile">모바일 모드</option>
                  </select>
                </label>
                <label>자동 새로고침<input value="30초" readOnly /></label>
                <label>버전<input value="V7 ADMIN RESTORE FINAL" readOnly /></label>
              </div>

              <div className="setting-actions">
                <button type="button" onClick={saveSystem}>시스템 설정 저장</button>
                <button type="button" onClick={resetSystem}>URL/화면모드 초기화</button>
                <button type="button" className="gray" onClick={closeModal}>닫기</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}