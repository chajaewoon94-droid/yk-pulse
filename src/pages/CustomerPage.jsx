import { pct } from "../utils/api";

export default function CustomerPage({ rows = [], reload }) {
  const top = [...rows].sort((a, b) => (b.remain || 0) - (a.remain || 0)).slice(0, 5);

  return (
    <section className="page">
      <div className="title">
        <h2>고객사 분석</h2>
        <p>고객사별 총건수, 완료, 잔여, 평균 SKU, 평균 PCS, 진행률을 확인합니다.</p>
      </div>

      <div className="customer-top">
        {top.map((c, i) => (
          <div className="customer-card" key={i}>
            <span>잔여 TOP {i + 1}</span>
            <b>{c.customer}</b>
            <p>
              잔여 {c.remain}건 · 평균 SKU {Number(c.avgSku || 0).toFixed(1)} · 평균 PCS {Number(c.avgPcs || 0).toFixed(1)}
            </p>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-title">
          <span>고객사별 출고 현황</span>
          <button className="reload-btn" onClick={reload}>분석 갱신</button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>고객사</th>
                <th>총건수</th>
                <th>요청</th>
                <th>작업중</th>
                <th>완료</th>
                <th>잔여</th>
                <th>평균 SKU</th>
                <th>평균 PCS</th>
                <th>진행률</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan="9">고객사 분석 데이터가 없습니다.</td></tr>}
              {rows.map((c, i) => (
                <tr key={i}>
                  <td>{c.customer}</td>
                  <td>{c.total}</td>
                  <td>{c.request}</td>
                  <td>{c.working}</td>
                  <td>{c.done}</td>
                  <td>{c.remain}</td>
                  <td>{Number(c.avgSku || 0).toFixed(1)}</td>
                  <td>{Number(c.avgPcs || 0).toFixed(1)}</td>
                  <td>{pct(c.progress)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
