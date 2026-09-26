import React, { useState } from "react";
import { postIngestSql } from "../services/api.js";

export default function IngestSQLTriggerForm() {
  const [driver, setDriver] = useState("pyodbc");
  const [targetOrders, setTargetOrders] = useState(110000);
  const [targetLines, setTargetLines] = useState(1050000);
  const [historyMonths, setHistoryMonths] = useState(14);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);

  const appendLog = (line) => setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);

  const trigger = async () => {
    setRunning(true);
    setLog([]);
    appendLog(`Starting ingestion via ${driver.toUpperCase()} driver...`);
    appendLog(`Targets: ${targetOrders.toLocaleString()} orders, ${targetLines.toLocaleString()} order lines, ${historyMonths} months of history.`);
    try {
      const data = await postIngestSql({
        source: driver,
        target_orders: Number(targetOrders),
        target_lines: Number(targetLines),
        history_months: Number(historyMonths),
      });
      appendLog("Ingestion completed successfully.");
      if (data.summary) {
        appendLog(`Summary: ${JSON.stringify(data.summary, null, 2)}`);
      }
      if (data.log_tail) {
        appendLog("--- server log tail ---");
        appendLog(data.log_tail);
      }
    } catch (err) {
      appendLog(`ERROR: ${err.response?.data?.detail?.error || err.message}`);
      if (err.response?.data?.detail?.stderr) {
        appendLog(err.response.data.detail.stderr);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Data Ingestion Trigger</h2>

      <div className="card">
        <div className="form-row">
          <label>Driver</label>
          <select value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="pyodbc">pyodbc (default — no SQL Server config changes required)</option>
            <option value="jdbc">jdbc (requires SQL Server TCP/IP enabled)</option>
          </select>
        </div>

        <div className="form-row">
          <label>Target Orders</label>
          <input type="number" min="1000" value={targetOrders} onChange={(e) => setTargetOrders(e.target.value)} />
        </div>

        <div className="form-row">
          <label>Target Order Lines</label>
          <input type="number" min="1000" value={targetLines} onChange={(e) => setTargetLines(e.target.value)} />
        </div>

        <div className="form-row">
          <label>History (months)</label>
          <input type="number" min="1" max="60" value={historyMonths} onChange={(e) => setHistoryMonths(e.target.value)} />
        </div>

        <button className="btn" onClick={trigger} disabled={running}>
          {running ? "Ingesting... (this can take several minutes)" : "Trigger Ingestion"}
        </button>
      </div>

      <div className="card">
        <div className="kpi-label" style={{ marginBottom: 8 }}>
          Status Log
        </div>
        <div className="status-log">
          {log.length === 0 ? <span className="empty-state">No ingestion run yet.</span> : log.join("\n")}
        </div>
      </div>
    </div>
  );
}
