import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { apiRequest, ApiError, setCsrfToken } from "./lib/api";
import { AuthScreen } from "./features/auth/AuthScreen";
import { AppShell } from "./layouts/AppShell";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { VoicePage } from "./features/voice/VoicePage";
import { MemoriesPage } from "./features/memory/MemoriesPage";
import type { User } from "./types";

type SessionResult = { user: User; csrfToken: string };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<SessionResult>("/api/v1/auth/session")
      .then((session) => {
        if (!active) return;
        setUser(session.user);
        setCsrfToken(session.csrfToken);
        setSessionUnavailable(false);
      })
      .catch((cause: unknown) => {
        if (active) {
          setUser(null);
          setCsrfToken(null);
          setSessionUnavailable(!(cause instanceof ApiError && cause.status === 401));
        }
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionAttempt]);

  if (sessionLoading) {
    return (
      <main className="startup-screen">
        <div className="loading-orb" />
        <p>Connecting to your workspace…</p>
      </main>
    );
  }

  if (sessionUnavailable) {
    return (
      <main className="startup-screen startup-error-screen" role="alert">
        <h1>JARVIS is temporarily unavailable</h1>
        <p>Could not reach the API. Check that it is running, then retry your session.</p>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setSessionLoading(true);
            setSessionAttempt((attempt) => attempt + 1);
          }}
        >
          Retry connection
        </button>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(session) => {
          setCsrfToken(session.csrfToken);
          setUser(session.user);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route
        element={
          <AppShell
            user={user}
            onSignOut={() => {
              setCsrfToken(null);
              setUser(null);
            }}
          />
        }
      >
        <Route index element={<DashboardPage user={user} />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="voice" element={<VoicePage />} />
        <Route path="assistant" element={<Navigate to="/voice" replace />} />
        <Route path="memory" element={<MemoriesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
