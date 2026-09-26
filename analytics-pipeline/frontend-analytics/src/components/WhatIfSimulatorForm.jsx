import React, { useEffect, useState } from "react";
import { getMenuIntelligence, postWhatIfSimulation } from "../services/api.js";

export default function WhatIfSimulatorForm() {
  const [menuItems, setMenuItems] = useState([]);
  const [menuItemId, setMenuItemId] = useState(null);
  const [priceChangePercent, setPriceChangePercent] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMenuIntelligence()
      .then((data) => {
        setMenuItems(data.menu_items);
        if (data.menu_items.length > 0) {
          setMenuItemId(data.menu_items[0].MenuItemId);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const runSimulation = async () => {
    if (!menuItemId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postWhatIfSimulation({
        menu_item_id: menuItemId,
        price_change_percent: Number(priceChangePercent),
        discount_percent: Number(discountPercent),
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (menuItemId) runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItemId]);

  return (
    <div>
      <h2 className="page-title">What-If Simulator</h2>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="form-row">
          <label>Menu Item</label>
          <select value={menuItemId ?? ""} onChange={(e) => setMenuItemId(Number(e.target.value))}>
            {menuItems.map((item) => (
              <option key={item.MenuItemId} value={item.MenuItemId}>
                {item.MenuItemName} ({item.MenuPerformanceClass})
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>
            Price Change <span className="slider-value">{priceChangePercent}%</span>
          </label>
          <input
            type="range"
            min="-50"
            max="100"
            step="1"
            value={priceChangePercent}
            onChange={(e) => setPriceChangePercent(e.target.value)}
            onMouseUp={runSimulation}
            onTouchEnd={runSimulation}
          />
        </div>

        <div className="form-row">
          <label>
            Discount <span className="slider-value">{discountPercent}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="75"
            step="1"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            onMouseUp={runSimulation}
            onTouchEnd={runSimulation}
          />
        </div>

        <button className="btn" onClick={runSimulation} disabled={loading}>
          {loading ? "Simulating..." : "Run Simulation"}
        </button>
      </div>

      {result && (
        <div className="card-grid">
          <MetricCard label="Elasticity Coefficient Used" value={result.elasticity_coefficient} />
          <MetricCard label="Current Price" value={`$${result.current_price}`} />
          <MetricCard label="Projected Price" value={`$${result.projected_price}`} />
          <MetricCard label="Current Revenue" value={`$${result.current_revenue.toLocaleString()}`} />
          <MetricCard
            label="Projected Revenue"
            value={`$${result.projected_revenue.toLocaleString()}`}
            delta={result.revenue_delta_percent}
          />
          <MetricCard
            label="Projected Profit"
            value={`$${result.projected_profit.toLocaleString()}`}
            delta={result.profit_delta_percent}
          />
          <MetricCard
            label="Projected Volume"
            value={result.projected_quantity.toLocaleString()}
            delta={result.volume_delta_percent}
          />
          <MetricCard label="Projected Margin %" value={`${result.projected_margin_percent}%`} />
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, delta }) {
  const deltaColor = delta > 0 ? "#6ee08a" : delta < 0 ? "#ff8080" : "#8b93a7";
  return (
    <div className="card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta !== undefined && (
        <div style={{ color: deltaColor, fontSize: "0.85rem", marginTop: 4 }}>
          {delta > 0 ? "+" : ""}
          {delta}% vs. current
        </div>
      )}
    </div>
  );
}
