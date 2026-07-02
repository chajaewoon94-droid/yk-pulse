import { fmt, num, displayProd } from "../utils/api";
import { riskClass } from "../utils/analytics";

function Bar({ value, max, color = "" }) {
  const width = Math.min(100, (value / max) * 100);
  return <div className="bar-wrap"><div className={`bar ${color}`} style={{ width: `${width}%` }} /></div>;
}

export default function HourlyTable({ rows = [] }) {
  const maxDone = Math.max(...rows.map((r) => num(r["시간당 완료"])), 1);
  return (
    <div className="section">
      <div className="section-title"><span>시간대별 출고 현황</span></div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>시간대</th><th>시간당 인입</th><th>시간당 완료</th><th>출고인원</th><th>경과시간</th><th>생산성</th><th>위험등급</th><th>누계완료</th><th>잔여</th><th>진행률</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="10">시간대별 데이터를 불러오는중입니다..</td></tr>}
            {rows.map((r, i) => (
              <tr key={`${r["시간대"] || "row"}-${i}`}>
                <td>{fmt(r["시간대"])}</td>
                <td>{fmt(r["시간당 인입"], "0")}</td>
                <td><b>{fmt(r["시간당 완료"], "0")}</b><Bar value={num(r["시간당 완료"])} max={maxDone} color="green" /></td>
                <td>{fmt(r["출고인원"], "0")}</td>
                <td>{fmt(r["경과시간"], "0.0")}</td>
                <td><b>{displayProd(r["생산성"])}</b></td>
                <td><span className={`risk-chip ${riskClass(r["생산성 위험등급"])}`}>{fmt(r["생산성 위험등급"])}</span></td>
                <td>{fmt(r["누계완료"], "0")}</td>
                <td>{fmt(r["잔여"], "0")}</td>
                <td>{fmt(r["진행률"], "0%")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
