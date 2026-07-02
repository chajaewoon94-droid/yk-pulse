import KpiCard from "../components/KpiCard";
import HourlyTable from "../components/HourlyTable";
import { displayProd } from "../utils/api";
import { riskClass } from "../utils/analytics";

function Field({ label, value }) {
  return <div><div className="label">{label}</div><div className="field">{value}</div></div>;
}

export default function HomePage({ dashboard = {}, hourly = [] }) {
  const d = dashboard;
  const currentProd = d["현재 생산성"] || d["생산성"] || "0";
  const avgProd = d["평균 생산성"] || d["현재까지 평균 생산성"] || "0";
  const risk = d["생산성 위험등급"] || "-";

  const noticeText = `[YK엔젤스 출고 생산성 현황]

운영일 : ${d["운영일"] || "-"}
총 인입 : ${d["총 인입"] || "0"}
출고완료 : ${d["출고완료"] || "0"}
잔여 : ${d["잔여"] || "0"}
진행률 : ${d["진행률"] || "0%"}

현재 출고 인원 : ${d["현재 출고 인원"] || "0"}명
현재 생산성 : ${displayProd(currentProd)}
현재까지 평균 생산성 : ${displayProd(avgProd)}
생산성 위험등급 : ${risk}
목표 생산성 : ${d["목표 생산성"] || "25"}
목표 달성률 : ${d["목표 달성률"] || "-"}
목표 부족 : ${d["목표 부족"] || "0"}건
다음 출고완료 타겟 : ${d["다음 출고완료 타겟"] || "-"} / ${d["다음 타겟까지"] || "0"}건 남음`;

  function copyNotice() {
    navigator.clipboard.writeText(noticeText).then(() => alert("복사 완료"));
  }

  return (
    <section className="page">
      <div className="title"><h2>출고 생산성 현황</h2><p>시간대별 생산성과 위험등급을 확인합니다.</p></div>

      <div className={`hero-status ${riskClass(risk)}`}>
        <div><span>현재 운영 상태</span><b>{risk}</b></div>
        <p>현재 {displayProd(currentProd)} · 평균 {displayProd(avgProd)} / 목표 {d["목표 생산성"] || "25"} · 잔여 {d["잔여"] || "0"}건</p>
      </div>

      <div className="filter-card">
        <div className="filter-grid">
          <Field label="센터" value={d["센터"] || "YI03"} />
          <Field label="운영일" value={d["운영일"] || "-"} />
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard icon="📥" title="총 인입" value={d["총 인입"] || "0"} />
        <KpiCard icon="✅" title="출고완료" value={d["출고완료"] || "0"} color="blue" />
        <KpiCard icon="📦" title="잔여" value={d["잔여"] || "0"} color="orange" />
        <KpiCard icon="📈" title="진행률" value={d["진행률"] || "0%"} color="red" />
      </div>

      <div className="kpi-grid">
        <KpiCard icon="👥" title="현재 출고 인원" value={d["현재 출고 인원"] || "0"} />
        <KpiCard icon="⚡" title="현재 생산성" value={displayProd(currentProd)} color="green" />
        <KpiCard icon="📊" title="현재까지 평균 생산성" value={displayProd(avgProd)} color="blue" />
        <KpiCard icon="🚦" title="생산성 위험등급" value={risk} color="red" />
      </div>

      <div className="kpi-grid">
        <KpiCard icon="🎯" title="목표 생산성" value={d["목표 생산성"] || "25"} color="orange" />
        <KpiCard icon="🏁" title="목표 달성률" value={d["목표 달성률"] || "-"} color="blue" />
        <KpiCard icon="🔥" title="목표 부족" value={d["목표 부족"] || "0"} color="orange" />
        <KpiCard icon="🎯" title="다음 완료 타겟" value={`${d["다음 출고완료 타겟"] || "-"} / +${d["다음 타겟까지"] || "0"}`} color="blue" small />
      </div>

      <div className="kpi-grid">
        <KpiCard icon="🕒" title="갱신시간" value={d["갱신시간"] || "-"} small />
        <KpiCard icon="📊" title="작업중 평균 O/L" value={d["작업중 평균 O/L"] || "0.0"} color="blue" />
        <KpiCard icon="📊" title="완료 평균 O/L" value={d["완료 평균 O/L"] || "0.0"} color="orange" />
        <KpiCard icon="📦" title="작업중 평균 PCS" value={d["작업중 평균 PCS"] || "0.0"} color="blue" />
      </div>

      <div className="kpi-grid single-last">
        <KpiCard icon="📦" title="완료 평균 PCS" value={d["완료 평균 PCS"] || "0.0"} color="orange" />
      </div>

      <HourlyTable rows={hourly} />

      <div className="section">
        <div className="section-title"><span>공지문</span><button className="reload-btn" onClick={copyNotice}>복사</button></div>
        <div className="notice-box">{noticeText}</div>
      </div>
    </section>
  );
}