export default function MessageModal({ message, onClose }) {
  if (!message) return null;
  return <div className="modal top-modal"><div className="message-card"><div className={`message-icon ${message.type === "warn" ? "warn" : ""}`}>{message.type === "warn" ? "⚠️" : "✅"}</div><h2>{message.title || "알림"}</h2><p>{message.text || ""}</p><button onClick={onClose}>확인</button></div></div>;
}
