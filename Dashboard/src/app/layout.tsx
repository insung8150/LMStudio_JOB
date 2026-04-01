import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LM Studio Dashboard",
  description: "LM Studio 모니터링 대시보드",
};

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/conversations", label: "GUI Chats", icon: "💬" },
  { href: "/api-conversations", label: "API Calls", icon: "🔌" },
  { href: "/api-sessions", label: "API Sessions", icon: "🧵" },
  { href: "/logs", label: "Live Logs", icon: "📡" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="flex h-screen">
          {/* 사이드바 */}
          <nav className="w-56 flex-shrink-0 border-r flex flex-col"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
            <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h1 className="text-lg font-bold" style={{ color: "var(--accent-blue)" }}>
                LM Studio
              </h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Monitoring Dashboard
              </p>
            </div>
            <div className="flex-1 p-2 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="p-4 text-xs" style={{ color: "var(--text-muted)" }}>
              server_rack · port 1234
            </div>
          </nav>

          {/* 메인 콘텐츠 */}
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
