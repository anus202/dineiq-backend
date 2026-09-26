import React, { useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import ExecutiveDashboard from "./components/ExecutiveDashboard.jsx";
import MenuMatrixView from "./components/MenuMatrixView.jsx";
import DualPipelineCompareView from "./components/DualPipelineCompareView.jsx";
import WhatIfSimulatorForm from "./components/WhatIfSimulatorForm.jsx";
import RecommendationsView from "./components/RecommendationsView.jsx";
import IngestSQLTriggerForm from "./components/IngestSQLTriggerForm.jsx";

const DEFAULT_PAGE_BY_ROLE = {
  Executive: "executive-dashboard",
  "Restaurant Manager": "executive-dashboard",
  "Data Engineer": "ingest",
  Analyst: "menu-matrix",
};

export default function App() {
  const [role, setRole] = useState("Executive");
  const [activePage, setActivePage] = useState(DEFAULT_PAGE_BY_ROLE.Executive);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setActivePage(DEFAULT_PAGE_BY_ROLE[newRole]);
  };

  const renderPage = () => {
    switch (activePage) {
      case "executive-dashboard":
        return <ExecutiveDashboard />;
      case "menu-matrix":
        return <MenuMatrixView />;
      case "dual-pipeline":
        return <DualPipelineCompareView />;
      case "what-if":
        return <WhatIfSimulatorForm />;
      case "recommendations":
        return <RecommendationsView />;
      case "ingest":
        return <IngestSQLTriggerForm />;
      default:
        return <ExecutiveDashboard />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar role={role} onRoleChange={handleRoleChange} activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">{renderPage()}</main>
    </div>
  );
}
