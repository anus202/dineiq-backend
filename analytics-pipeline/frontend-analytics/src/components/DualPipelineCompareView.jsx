import React, { useEffect, useState } from "react";
import { getDualPipelineCompare } from "../services/api.js";

export default function DualPipelineCompareView() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sampleSize, setSampleSize] = useState(100);

  const load = () => {
    setLoading(true);
    setError(null);
    getDualPipelineCompare(sampleSize)
      .then(setReport)
      .catch((err) => setError(err.response?.data?.detail || err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h2 className="page-title">Dual-Pipeline Verification</h2>
      <p className="empty-state" style={{ marginBottom: 16 }}>
        Compares the Spark MLlib menu-performance classifier against the independent
        Python/XGBoost classifier on the same held-out records.
      </p>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <label>
          Sample size:{" "}
          <input
            type="number"
            min="10"
            max="1000"
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            style={{ width: 90, display: "inline-block" }}
          />
        </label>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Comparing..." : "Re-run Comparison"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {report && (
        <>
          <div className="card-grid">
            <div className="card">
              <div className="kpi-label">Agreement</div>
              <div className="kpi-value">{report.agreement_percent}%</div>
              <div className="meter">
                <div className="meter-fill" style={{ width: `${report.agreement_percent}%` }} />
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Matched / Total</div>
              <div className="kpi-value">
                {report.matched_count} / {report.total_records}
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Spark Accuracy vs. Actual</div>
              <div className="kpi-value">{report.spark_accuracy_vs_actual}%</div>
            </div>
            <div className="card">
              <div className="kpi-label">XGBoost Accuracy vs. Actual</div>
              <div className="kpi-value">{report.xgboost_accuracy_vs_actual}%</div>
            </div>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Actual Class</th>
                  <th>Spark Prediction</th>
                  <th>XGBoost Prediction</th>
                  <th>Match</th>
                  <th>Disagreement Reason</th>
                </tr>
              </thead>
              <tbody>
                {report.comparisons.map((c) => (
                  <tr key={c.menu_item_id}>
                    <td>{c.menu_item_name}</td>
                    <td>{c.actual_class}</td>
                    <td>{c.spark_prediction}</td>
                    <td>{c.xgboost_prediction}</td>
                    <td>
                      <span className={`badge ${c.match ? "badge-match" : "badge-mismatch"}`}>
                        {c.match ? "Match" : "Mismatch"}
                      </span>
                    </td>
                    <td>{c.disagreement_reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
