import React, { useEffect, useState } from "react";
import { getRecommendations } from "../services/api.js";

export default function RecommendationsView() {
  const [recs, setRecs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRecommendations()
      .then((data) => setRecs(data.recommendations))
      .catch((err) => setError(err.response?.data?.detail || err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!recs) return <p className="empty-state">Loading...</p>;

  return (
    <div>
      <h2 className="page-title">Recommendations Engine</h2>

      {recs.length === 0 && <p className="empty-state">No recommendations generated.</p>}

      {recs.map((rec, idx) => (
        <div className="card" key={idx}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong>{rec.title}</strong>
            <span className={`badge badge-${rec.priority}`}>{rec.priority}</span>
          </div>
          <div style={{ color: "#8b93a7", fontSize: "0.82rem", marginBottom: 6 }}>{rec.category}</div>
          <p style={{ margin: "6px 0" }}>{rec.justification}</p>
          <p style={{ margin: "6px 0", color: "#7cc4ff" }}>Action: {rec.action}</p>
          <div style={{ fontSize: "0.8rem", color: "#8b93a7" }}>
            {Object.entries(rec.metrics)
              .map(([k, v]) => `${k}: ${v}`)
              .join("  •  ")}
          </div>
        </div>
      ))}
    </div>
  );
}
