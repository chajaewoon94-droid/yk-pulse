export default function Loading({ text }) {
  return <div className="loading"><div className="loading-card"><div className="spinner"/><h2>진행 중</h2><p>{text}</p></div></div>;
}
