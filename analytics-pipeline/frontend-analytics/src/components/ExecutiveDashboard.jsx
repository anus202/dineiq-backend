import React, { useEffect, useState } from "react";
import { getExecutiveDashboard } from "../services/api.js";

export default function ExecutiveDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getExecutiveDashboard()
      .then(setData)
      .catch((err) => setError(err.response?.data?.detail || err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p className="empty-state">Loading...</p>;

  return (
    <div>
      <h2 className="page-title">Executive Dashboard</h2>

      <div className="card-grid">
        <Kpi label="Total Revenue" value={`$${data.total_revenue.toLocaleString()}`} />
        <Kpi label="Total Margin" value={`$${data.total_margin.toLocaleString()}`} />
        <Kpi label="Overall Margin %" value={`${data.overall_margin_percent}%`} />
        <Kpi label="Total Orders" value={data.total_orders.toLocaleString()} />
        <Kpi label="Average Order Value" value={`$${data.average_order_value}`} />
      </div>

      <div className="card">
        <div className="kpi-label" style={{ marginBottom: 10 }}>
          Menu Performance Distribution
        </div>
        {Object.entries(data.menu_performance_distribution).map(([cls, count]) => (
          <div key={cls} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
            <span>{cls}</span>
            <span>{count}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="kpi-label" style={{ marginBottom: 10 }}>
          Top Menu Items by Revenue
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Revenue</th>
              <th>Margin %</th>
              <th>Class</th>
            </tr>
          </thead>
          <tbody>
            {data.top_menu_items_by_revenue.map((item) => (
              <tr key={item.MenuItemId}>
                <td>{item.MenuItemName}</td>
                <td>${item.TotalRevenue.toLocaleString()}</td>
                <td>{item.MarginPercent}%</td>
                <td>{item.MenuPerformanceClass}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="kpi-label" style={{ marginBottom: 10 }}>
          Revenue by Category
        </div>
        {Object.entries(data.revenue_by_category).map(([cat, rev]) => (
          <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
            <span>{cat}</span>
            <span>${rev.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
