import { useMemo, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { jsonp } from "../utils/api";
import { analyzeOt, makeFallbackOtComment, makeLocalAiAnswer } from "../utils/analytics";

export default function AiPage({ dashboard = {}, hourly = [], customers = [], settings = {} }) {
  const [mode, setMode] = useState("ot");
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "JAVIS AI OT 분석입니다. 잔업을 최소화하고, 현재 처리속도와 다음 30분/1시간 현실 목표 기준으로 판단합니다.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const askingRef = useRef(false);

  const analysis = useMemo(
    () => analyzeOt(dashboard, hourly, customers, settings),
    [dashboard, hourly, customers, settings]
  );

  const comment = makeFallbackOtComment(dashboard, hourly, customers, settings);

  async function ask(questionText) {
    if (askingRef.current || loading) return;

    const question = (questionText || q).trim();
    if (!question) return;

    askingRef.current = true;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setQ("");
    setLoading(true);

    try {
      const res = await jsonp("aiot", { q: question });

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: res?.answer || "JAVIS AI 답변이 없습니다. Apps Script aiot API를 확인해주세요.",
        },
      ]);
    } catch (e) {
      const fallback = makeLocalAiAnswer(question, analysis, dashboard, hourly, customers, settings);

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text:
            fallback +
            "\n\n※ JAVIS AI API 연결 실패로 현재 화면 데이터 기준 로컬 분석했습니다.",
        },
      ]);
    } finally {
      askingRef.current = false;
      setLoading(false);
    }
  }

  function copyReport() {
    const text = `[JAVIS AI OT 분석]

판단: ${analysis.decision}
현재시간: ${analysis.now}
근무조: ${analysis.shift}
잔여량: ${analysis.remain.toLocaleString()}건
출고 인원: ${analysis.people}명
현재 생산성: ${analysis.productivityText}
현재 시간당 처리량: ${analysis.hourlyCapacity.toLocaleString()}건/h
정규 종료: ${analysis.regularEnd}
예상 종료: ${analysis.finishTime}
예상 소요: ${analysis.finishDuration}

정규 종료까지 처리 가능: ${analysis.possibleRegular.toLocaleString()}건
정규 종료까지 부족: ${analysis.lackRegular.toLocaleString()}건
다음 30분 목표: ${(analysis.next30Low || 0).toLocaleString()}~${(analysis.next30High || analysis.next30Need || 0).toLocaleString()}건
다음 1시간 목표: ${analysis.nextHourNeed.toLocaleString()}건`;

    navigator.clipboard.writeText(text).then(() => alert("복사 완료"));
  }

  const cards = [
    ["근무조", analysis.shift],
    ["현재시간", analysis.now],
    ["잔여량", analysis.remain.toLocaleString() + "건"],
    ["출고 인원", analysis.people + "명"],
    ["현재 생산성", analysis.productivityText],
    ["현재 시간당 처리량", analysis.hourlyCapacity.toLocaleString() + "건/h"],
    ["정규 종료", analysis.regularEnd],
    ["예상 종료", analysis.finishTime],
    ["예상 소요", analysis.finishDuration],
    ["정규 종료까지 처리 가능", analysis.possibleRegular.toLocaleString() + "건"],
    ["정규 종료까지 부족", analysis.lackRegular.toLocaleString() + "건"],
    ["다음 30분 목표", `${(analysis.next30Low || 0).toLocaleString()}~${(analysis.next30High || analysis.next30Need || 0).toLocaleString()}건`],
    ["다음 1시간 목표", analysis.nextHourNeed.toLocaleString() + "건"],
  ];

  return (
    <section className="page">
      <div className="title">
        <h2>AI OT 분석</h2>
        <p>잔업 최소화를 기준으로 현재 처리속도, 잔여량, 다음 30분/1시간 현실 목표를 판단합니다.</p>
      </div>

      <div className="ai-tabs">
        <button className={mode === "ot" ? "active" : ""} onClick={() => setMode("ot")}>작업 판단</button>
        <button className={mode === "trend" ? "active" : ""} onClick={() => setMode("trend")}>시간대 추세</button>
        <button className={mode === "customer" ? "active" : ""} onClick={() => setMode("customer")}>고객사 잔여</button>
        <button className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>JAVIS 대화</button>
      </div>

      {mode === "ot" && (
        <div className="ai-layout">
          <div className="section">
            <div className="section-title">
              <span>JAVIS OT 계산 결과</span>
              <button type="button" className="reload-btn" onClick={copyReport}>보고 복사</button>
            </div>
            <div className="ai-content">
              <h3>{analysis.decision}</h3>
              <p>{comment}</p>
              <div className="ot-grid">
                {cards.map((x, i) => (
                  <div key={i}>
                    <span>{x[0]}</span>
                    <b>{x[1]}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">
              <span>JAVIS 운영 제안</span>
            </div>
            <div className="ai-content">
              <pre className="report-box">{analysis.report}</pre>
              <div className="quick-buttons">
                <button type="button" disabled={loading} onClick={() => ask("오늘 잔업 필요해? 잔업 안 하는 기준으로 판단해줘")}>
                  오늘 잔업 필요?
                </button>
                <button type="button" disabled={loading} onClick={() => ask("다음 30분과 1시간에 몇 건 처리하면 되는지 알려줘")}>
                  다음 목표 처리량
                </button>
                <button type="button" disabled={loading} onClick={() => ask("부장님 보고용 문구로 정리해줘")}>
                  보고 문구
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "trend" && (
        <div className="section">
          <div className="section-title"><span>시간대별 생산성 추세</span></div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>시간대</th>
                  <th>인입</th>
                  <th>완료</th>
                  <th>출고인원</th>
                  <th>생산성</th>
                  <th>잔여</th>
                  <th>진행률</th>
                </tr>
              </thead>
              <tbody>
                {hourly.length === 0 && <tr><td colSpan="7">시간대별 데이터가 없습니다.</td></tr>}
                {hourly.map((r, i) => (
                  <tr key={i}>
                    <td>{r["시간대"]}</td>
                    <td>{r["시간당 인입"]}</td>
                    <td>{r["시간당 완료"]}</td>
                    <td>{r["출고인원"]}</td>
                    <td>{r["생산성"]}</td>
                    <td>{r["잔여"]}</td>
                    <td>{r["진행률"]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mode === "customer" && (
        <div className="section">
          <div className="section-title"><span>고객사별 잔여 물량</span></div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>고객사</th>
                  <th>잔여</th>
                  <th>완료</th>
                  <th>평균 SKU</th>
                  <th>평균 PCS</th>
                  <th>진행률</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 && <tr><td colSpan="5">고객사 데이터가 없습니다.</td></tr>}
                {[...customers].sort((a, b) => (b.remain || 0) - (a.remain || 0)).map((c, i) => (
                  <tr key={i}>
                    <td>{c.customer}</td>
                    <td>{c.remain}</td>
                    <td>{c.done}</td>
                    <td>{Number(c.avgSku || 0).toFixed(1)}</td>
                    <td>{Number(c.avgPcs || 0).toFixed(1)}</td>
                    <td>{((Number(c.progress) || 0) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mode === "chat" && (
        <div className="section chat-panel wide-chat">
          <div className="section-title">
            <span><Bot size={18} /> JAVIS AI Assistant</span>
          </div>

          <div className="chat-body">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>{m.text}</div>
            ))}
            {loading && <div className="chat-msg bot">JAVIS AI가 분석 중입니다...</div>}
          </div>

          <div className="chat-input">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ask();
                }
              }}
              placeholder="예: 다음 타임에 몇 건 처리해야 해?"
            />
            <button
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <Send size={17} /> 전송
            </button>
          </div>
        </div>
      )}
    </section>
  );
}