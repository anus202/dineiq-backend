import React, { useEffect, useState } from "react";
import { getMenuIntelligence } from "../services/api.js";

export default function MenuMatrixView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    getMenuIntelligence()
      .then(setData)
      .catch((err) => setError(err.response?.data?.detail || err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p className="empty-state">Loading...</p>;

  const classes = ["All", "Star", "PlowHorse", "Puzzle", "Dog"];
  const items = filter === "All" ? data.menu_items : data.menu_items.filter((i) => i.MenuPerformanceClass === filter);

  return (
    <div>
      <h2 className="page-title">Menu Matrix</h2>

      <div className="card" style={{ display: "flex", gap: 8 }}>
        {classes.map((c) => (
          <button
            key={c}
            className="btn"
            style={{ background: filter === c ? "#3462e0" : "#232a3d" }}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Qty Sold</th>
              <th>Revenue</th>
              <th>Margin %</th>
              <th>Wastage %</th>
              <th>Avg Rating</th>
              <th>Class</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.MenuItemId}>
                <td>{item.MenuItemName}</td>
                <td>{item.CategoryName}</td>
                <td>{item.TotalQuantitySold}</td>
                <td>${item.TotalRevenue.toLocaleString()}</td>
                <td>{item.MarginPercent}%</td>
                <td>{item.WastagePercent}%</td>
                <td>{item.AvgRating?.toFixed?.(2) ?? item.AvgRating}</td>
                <td>{item.MenuPerformanceClass}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="kpi-label" style={{ marginBottom: 10 }}>
          Price Sensitivity
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Correlation</th>
              <th>Elasticity Label</th>
              <th>Interpretation</th>
            </tr>
          </thead>
          <tbody>
            {data.price_sensitivity.map((row) => (
              <tr key={row.menu_item_id}>
                <td>{row.menu_item_name}</td>
                <td>{row.price_quantity_correlation ?? "—"}</td>
                <td>{row.elasticity_label}</td>
                <td>{row.interpretation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
