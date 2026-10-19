import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AudioLines,
  Brain,
  ChevronDown,
  CheckSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import type { User } from "../types";

const navigation = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Voice", to: "/voice", icon: AudioLines },
  { label: "Tasks", to: "/tasks", icon: CheckSquare },
  { label: "Memory", to: "/memory", icon: Brain },
];
const pageNames: Record<string, string> = {
  "/": "Overview",
  "/voice": "Voice Assistant",
  "/tasks": "Tasks",
  "/memory": "Memory",
};
const commands = [
  { label: "Open dashboard", path: "/", keywords: "home overview dashboard" },
  {
    label: "Talk to JARVIS",
    path: "/voice",
    keywords: "chat conversation ask microphone speak voice",
  },
  { label: "View tasks", path: "/tasks", keywords: "todo productivity" },
  { label: "Create a task", path: "/tasks", keywords: "new add task" },
];

export function AppShell({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    return commands.filter(
      (command) => !query || `${command.label} ${command.keywords}`.includes(query),
    );
  }, [commandQuery]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  async function signOut() {
    try {
      await apiRequest("/api/v1/auth/logout", { method: "POST" });
      onSignOut();
    } catch {
      setSignOutError("Could not sign out. Check your connection and try again.");
    }
  }

  function runCommand(path: string) {
    navigate(path);
    setCommandOpen(false);
    setCommandQuery("");
  }

  return (
    <div className="app-frame">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="mobile-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <span>
            JARVIS<span className="brand-light"> ULTIMATE</span>
          </span>
          <button
            className="mobile-close icon-button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>
        <button className="new-chat-button" onClick={() => navigate("/voice")}>
          <AudioLines size={16} />
          <span>Talk to JARVIS</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Voice" && <span className="nav-live" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-status">
            <span className="status-dot" />
            <span>Workspace active</span>
            <span className="status-label">LOCAL</span>
          </div>
          <div className="profile-wrap">
            {menuOpen && (
              <div className="profile-menu">
                <div className="profile-menu-user">
                  <strong>{user.displayName}</strong>
                  <span>{user.email}</span>
                </div>
                {signOutError && (
                  <p className="profile-error" role="alert">
                    {signOutError}
                  </p>
                )}
                <button onClick={() => void signOut()}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
            <button
              className="profile-button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
            >
              <span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="profile-copy">
                <strong>{user.displayName}</strong>
                <small>Personal workspace</small>
              </span>
              <ChevronDown size={15} className="profile-chevron" />
            </button>
          </div>
        </div>
      </aside>
      <main className={`main-area ${location.pathname === "/voice" ? "main-area-chat" : ""}`}>
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{pageNames[location.pathname] ?? "Workspace"}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              onClick={() => setCommandOpen(true)}
              aria-label="Open command palette"
            >
              <Search size={15} />
              <span>Search commands</span>
              <kbd>Ctrl / ⌘ K</kbd>
            </button>
            <div className="topbar-divider" />
            <span className="connection-label">
              <Activity size={14} /> Secure session
            </span>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
      {commandOpen && (
        <div
          className="command-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCommandOpen(false);
          }}
        >
          <section
            className="command-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-title"
          >
            <h2 id="command-title" className="sr-only">
              Command palette
            </h2>
            <div className="command-search">
              <Search size={17} />
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Search commands and pages…"
                aria-label="Search commands"
              />
              <kbd>ESC</kbd>
              <button
                className="icon-button"
                onClick={() => setCommandOpen(false)}
                aria-label="Close command palette"
              >
                <X size={16} />
              </button>
            </div>
            <div className="command-list">
              {filteredCommands.length ? (
                filteredCommands.map((command) => (
                  <button key={command.label} onClick={() => runCommand(command.path)}>
                    <span>
                      <Sparkles size={15} />
                    </span>
                    <strong>{command.label}</strong>
                    <ArrowRightIcon />
                  </button>
                ))
              ) : (
                <p>No matching commands.</p>
              )}
            </div>
            <footer>
              <span>Ctrl / ⌘ K to toggle</span>
              <span>JARVIS WORKSPACE</span>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <span className="command-arrow" aria-hidden="true">
      ↵
    </span>
  );
}
