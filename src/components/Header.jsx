import { Bot, Home, Menu, RefreshCw, Settings, Users, X } from "lucide-react";
import { useState } from "react";

const menus = [
  { id: "home", label: "홈", icon: Home },
  { id: "customer", label: "고객사 분석", icon: Users },
  { id: "ai", label: "AI OT 분석", icon: Bot },
];

export default function Header({ page, setPage, onRefresh, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  function go(id) { setPage(id); setOpen(false); }
  return (
    <header className="top-header">
      <div className="brand">
        <div className="logo">YK</div>
        <div><h1>YK ANGELS PULSE</h1><p>JAVIS AI Powered Outbound Control Tower</p></div>
      </div>
      <nav className={`page-nav ${open ? "open" : ""}`}>
        {menus.map((m) => {
          const Icon = m.icon;
          return <button key={m.id} className={page === m.id ? "active" : ""} onClick={() => go(m.id)}><Icon size={17} /><span>{m.label}</span></button>;
        })}
      </nav>
      <div className="top-actions">
        <button className="icon-btn mobile-menu" onClick={() => setOpen(!open)}>{open ? <X size={19}/> : <Menu size={19}/>}</button>
        <button className="settings-action" onClick={onOpenSettings}><Settings size={18}/><span className="settings-text"><b>설정</b><small>관리자</small></span></button>
        <button className="reload-btn" onClick={onRefresh}><RefreshCw size={17}/> 새로고침</button>
      </div>
    </header>
  );
}
