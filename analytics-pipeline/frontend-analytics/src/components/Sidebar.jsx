import React from "react";

const ALL_NAV_ITEMS = [
  { key: "executive-dashboard", label: "Executive Dashboard", roles: ["Executive", "Restaurant Manager"] },
  { key: "menu-matrix", label: "Menu Matrix", roles: ["Executive", "Restaurant Manager", "Analyst"] },
  { key: "dual-pipeline", label: "Dual-Pipeline Verification", roles: ["Data Engineer", "Analyst"] },
  { key: "what-if", label: "What-If Simulator", roles: ["Executive", "Restaurant Manager", "Analyst"] },
  { key: "recommendations", label: "Recommendations Engine", roles: ["Executive", "Restaurant Manager", "Analyst"] },
  { key: "ingest", label: "Data Ingestion Trigger", roles: ["Data Engineer"] },
];

export const ROLES = ["Executive", "Restaurant Manager", "Data Engineer", "Analyst"];

export default function Sidebar({ role, onRoleChange, activePage, onNavigate }) {
  const visibleItems = ALL_NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">DineIQ Analytics</div>
      <div className="sidebar-role">
        Role
        <select value={role} onChange={(e) => onRoleChange(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="sidebar-nav">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            className={activePage === item.key ? "active" : ""}
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
