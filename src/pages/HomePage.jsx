import { useMemo } from "react";
import KpiCard from "../components/KpiCard";
import HourlyTable from "../components/HourlyTable";
import { displayProd } from "../utils/api";
import { analyzeOt, riskClass } from "../utils/analytics";

function Field({ label, value }) {
  return <div><div className="label">{label}</div><div className="field">{value}</div></div>;
}

export default function HomePage({ dashboard = {}, hourly = [], customers = [], settings = {} }) {
  const d = dashboard;

  const analysis = useMemo(
    () => analyzeOt(dashboard, hourly, customers, settings),
    [dashboard, hourly, customers, settings]
  );

  const currentProd = d["현재 생산성"] || d["생산성"] || analysis.productivity || "0";
  const avgProd = d["평균 생산성"] || d["현재까지 평균 생산성"] || analysis.avgProductivity || "0";
  const risk = analysis.decision || d["생산성 위험등급"] || "-";

  const requiredProd =
    analysis.minutesToRegular > 0 && analysis.people > 0
      ? analysis.remain / ((analysis.minutesToRegular / 60) * analysis.people)
      : 0;

  const lackProd = Math.max(requiredProd - Number(analysis.productivity || 0), 0);
  const lackQty = analysis.lackRegular || 0;
  const expectedFinish = analysis.finishTime || "-";
  const remainHours = analysis.minutesToRegular > 0 ? analysis.minutesToRegular / 60 : 0;

  const noticeText = `[YK엔젤스 출고 생산성 현황]

운영일 : ${d["운영일"] || analysis.workDate || "-"}
총 인입 : ${d["총 인입"] || "0"}
출고완료 : ${d["출고완료"] || "0"}
잔여 : ${d["잔여"] || analysis.remain || "0"}
진행률 : ${d["진행률"] || "0%"}

현재 출고 인원 : ${d["현재 출고 인원"] || analysis.people || "0"}명
현재 생산성 : ${displayProd(currentProd)}
현재까지 평균 생산성 : ${displayProd(avgProd)}
운영 상태 : ${risk}

정시 마감 필요 생산성 : ${displayProd(requiredProd)}
현재 대비 부족 생산성 : ${displayProd(lackProd)}
정시 마감 부족 수량 : ${Number(lackQty || 0).toLocaleString()}건
예상 마감 시간 : ${expectedFinish}
남은 작업 가능 시간 : ${remainHours.toFixed(1)}시간`;

  function copyNotice() {
    navigator.clipboard.writeText(noticeText).then(() => alert("복사 완료"));
  }

  return (
    <section className="page">
      <div className="title"><h2>출고 생산성 현황</h2><p>시간대별 생산성과 위험등급을 확인합니다.</p></div>

      <div className={`hero-status ${riskClass(risk)}`}>
        <div><span>현재 운영 상태</span><b>{risk}</b></div>
        <p>
          현재 {displayProd(currentProd)} · 평균 {displayProd(avgProd)} / 
          정시 필요 {displayProd(requiredProd)} · 잔여 {(analysis.remain || 0).toLocaleString()}건
        </p>
      </div>

      <div className="filter-card">
        <div className="filter-grid">
          <Field label="센터" value={d["센터"] || "YI03"} />
          <Field label="운영일" value={d["운영일"] || analysis.workDate || "-"} />
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard icon="📥" title="총 인입" value={d["총 인입"] || "0"} />
        <KpiCard icon="✅" title="출고완료" value={d["출고완료"] || "0"} color="blue" />
        <KpiCard icon="📦" title="잔여" value={(analysis.remain || 0).toLocaleString()} color="orange" />
        <KpiCard icon="📈" title="진행률" value={d["진행률"] || "0%"} color="red" />
      </div>

      <div className="kpi-grid">
        <KpiCard icon="👥" title="현재 출고 인원" value={analysis.people || d["현재 출고 인원"] || "0"} />
        <KpiCard icon="⚡" title="현재 생산성" value={displayProd(currentProd)} color="green" />
        <KpiCard icon="📊" title="현재까지 평균 생산성" value={displayProd(avgProd)} color="blue" />
        <KpiCard icon="🚦" title="운영 상태" value={risk} color={risk.includes("가능") ? "green" : "red"} />
      </div>

      <div className="kpi-grid">
        <KpiCard icon="🎯" title="정시 필요 생산성" value={displayProd(requiredProd)} color="orange" />
        <KpiCard icon="⚠️" title="현재 대비 부족" value={displayProd(lackProd)} color="red" />
        <KpiCard icon="🔥" title="정시 부족 수량" value={Number(lackQty || 0).toLocaleString()} color="orange" />
        <KpiCard icon="🕒" title="예상 마감 시간" value={expectedFinish} color="blue" small />
      </div>

      <div className="kpi-grid">
        <KpiCard icon="⏳" title="남은 작업 가능 시간" value={remainHours.toFixed(1)} color="blue" />
        <KpiCard icon="📊" title="작업중 평균 O/L" value={d["작업중 평균 O/L"] || "0.0"} color="blue" />
        <KpiCard icon="📊" title="완료 평균 O/L" value={d["완료 평균 O/L"] || "0.0"} color="orange" />
        <KpiCard icon="📦" title="작업중 평균 PCS" value={d["작업중 평균 PCS"] || "0.0"} color="blue" />
      </div>

      <div className="kpi-grid single-last">
        <KpiCard icon="📦" title="완료 평균 PCS" value={d["완료 평균 PCS"] || "0.0"} color="orange" />
        <KpiCard icon="🕒" title="갱신시간" value={d["갱신시간"] || "-"} small />
      </div>

      <HourlyTable rows={hourly} />

      <div className="section">
        <div className="section-title"><span>공지문</span><button className="reload-btn" onClick={copyNotice}>복사</button></div>
        <div className="notice-box">{noticeText}</div>
      </div>
    </section>
  );
}