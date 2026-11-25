import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { Today } from "./Today.js";
import { Chart } from "./Chart.js";
import { Settings } from "./Settings.js";

type View = "today" | "chart" | "settings";

function App() {
  const [view, setView] = useState<View>("chart");
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((m: string | null) => setError(m), []);

  return (
    <main>
      <header className="row">
        <h1>SOAP Scribe</h1>
        <nav>
          <button className={view === "chart" ? "tab active" : "tab"} onClick={() => setView("chart")}>Chart</button>
          <button className={view === "today" ? "tab active" : "tab"} onClick={() => setView("today")}>Today</button>
          <button className={view === "settings" ? "tab active" : "tab"} onClick={() => setView("settings")}>Settings</button>
        </nav>
      </header>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      {view === "chart" && <Chart onError={onError} />}
      {view === "today" && <Today onError={onError} />}
      {view === "settings" && <Settings onError={onError} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
