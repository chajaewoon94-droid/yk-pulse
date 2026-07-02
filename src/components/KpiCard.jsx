export default function KpiCard({ icon, title, value, color = "", small = false }) {
  return <div className={`kpi ${color}`}><div className="icon">{icon}</div><h3>{title}</h3><div className="num" style={{fontSize: small ? 20 : undefined}}>{value}</div></div>;
}
