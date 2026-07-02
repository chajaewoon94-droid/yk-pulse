import { useEffect, useState } from "react";
import Header from "./components/Header";
import Loading from "./components/Loading";
import MessageModal from "./components/MessageModal";
import SettingsModal from "./components/SettingsModal";
import HomePage from "./pages/HomePage";
import CustomerPage from "./pages/CustomerPage";
import AiPage from "./pages/AiPage";
import { AUTO_REFRESH_MS, applyViewMode, jsonp } from "./utils/api";

export default function App() {
  const [page, setPage] = useState("home");
  const [data, setData] = useState({ dashboard: {}, hourly: [], settings: {} });
  const [customerData, setCustomerData] = useState([]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState(null);

  async function loadPulse(show = false) {
    if (show) setLoading("출고 생산성 현황을 불러오고 있습니다.");
    try {
      const res = await jsonp("pulse");
      if (res?.ok === false) throw new Error(res.error || "API 오류");
      setData(res || { dashboard: {}, hourly: [], settings: {} });
      setError("");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading("");
    }
  }

  async function loadCustomer(show = false) {
    if (show) setLoading("고객사 분석을 불러오고 있습니다.");
    try {
      const res = await jsonp("customer");
      if (res?.ok === false) throw new Error(res.error || "API 오류");
      setCustomerData(res?.customers || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading("");
    }
  }

  function reloadAll() {
    loadPulse(true);
    loadCustomer(false);
  }

  function openSettings() {
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
  }

  useEffect(() => {
    applyViewMode();
    loadPulse(false);
    loadCustomer(false);

    const timer = setInterval(() => {
      loadPulse(false);
      loadCustomer(false);
    }, AUTO_REFRESH_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pulse-app">
      {loading && <Loading text={loading} />}

      <MessageModal
        message={message}
        onClose={() => setMessage(null)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        setMessage={setMessage}
        reload={reloadAll}
        initialSettings={data.settings || {}}
      />

      <Header
        page={page}
        setPage={setPage}
        onRefresh={reloadAll}
        onOpenSettings={openSettings}
      />

      <main>
        {error && <div className="error-box">⚠️ {error}</div>}

        {page === "home" && (
          <HomePage
            dashboard={data.dashboard || {}}
            hourly={data.hourly || []}
          />
        )}

        {page === "customer" && (
          <CustomerPage
            rows={customerData}
            reload={() => loadCustomer(true)}
          />
        )}

        {page === "ai" && (
          <AiPage
            dashboard={data.dashboard || {}}
            hourly={data.hourly || []}
            customers={customerData}
            settings={data.settings || {}}
          />
        )}
      </main>
    </div>
  );
}