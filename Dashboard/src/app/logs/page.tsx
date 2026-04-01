"use client";

import LiveLogViewer from "./_components/live-log-viewer";

export default function LogsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Live Logs</h2>
      <LiveLogViewer />
    </div>
  );
}
