"use client";

import GpuCards from "./_components/gpu-cards";
import LoadedModelsTable from "./_components/loaded-models-table";
import SystemSummary from "./_components/system-summary";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Dashboard</h2>

      <SystemSummary />

      <div>
        <h3
          className="text-sm font-medium mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          GPU Status
        </h3>
        <GpuCards />
      </div>

      <div>
        <h3
          className="text-sm font-medium mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          Loaded Models
        </h3>
        <LoadedModelsTable />
      </div>
    </div>
  );
}
