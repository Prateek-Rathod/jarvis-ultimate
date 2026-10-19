import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { apiRequest, ApiError } from "../../lib/api";
import type { User } from "../../types";

interface AuthSession {
  user: User;
  csrfToken: string;
}

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (session: AuthSession) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [readinessStatus, setReadinessStatus] = useState<
    "checking" | "ready" | "database-unavailable" | "api-unavailable"
  >("checking");
  const [submitting, setSubmitting] = useState(false);
  const [readinessAttempt, setReadinessAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest("/health/ready")
      .then(() => {
        if (active) setReadinessStatus("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setReadinessStatus(
          cause instanceof ApiError && cause.status === 503
            ? "database-unavailable"
            : "api-unavailable",
        );
      });
    return () => {
      active = false;
    };
  }, [readinessAttempt]);
  const setupNotice = {
    checking: "Checking API and database readiness…",
    ready: "",
    "database-unavailable":
      "Database is not ready. Start PostgreSQL and verify the server DATABASE_URL.",
    "api-unavailable": "The API is temporarily unavailable. Check that the server is running.",
  }[readinessStatus];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const session = await apiRequest<AuthSession>(`/api/v1/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password, ...(mode === "register" ? { displayName } : {}) }),
      });
      onAuthenticated(session);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Unable to connect to the API. Check that the server is running.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={21} strokeWidth={1.8} />
          </div>
          <span>
            JARVIS<span className="brand-light"> ULTIMATE</span>
          </span>
        </div>
        <div className="auth-intro">
          <span className="eyebrow">
            <span className="status-dot" /> PRIVATE WORKSPACE
          </span>
          <h1>{mode === "login" ? "Your day, in focus." : "Create your workspace."}</h1>
          <p>
            {mode === "login"
              ? "Sign in to pick up where you left off."
              : "A personal space for thoughtful work and clear priorities."}
          </p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {setupNotice && (
            <div className="setup-notice" role="status">
              <span>{setupNotice}</span>
              <button
                type="button"
                onClick={() => {
                  setReadinessStatus("checking");
                  setReadinessAttempt((attempt) => attempt + 1);
                }}
                disabled={readinessStatus === "checking"}
              >
                Retry
              </button>
            </div>
          )}
          {mode === "register" && (
            <label>
              <span>Your name</span>
              <input
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Alex Morgan"
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              maxLength={254}
            />
          </label>
          <label>
            <span>
              Password{" "}
              <span className="field-hint">{mode === "register" ? "12+ characters" : ""}</span>
            </span>
            <div className="password-input">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
                required
                minLength={mode === "register" ? 12 : 1}
                maxLength={128}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            {!submitting && <ArrowRight size={17} />}
          </button>
        </form>
        <div className="auth-switch">
          <span>
            {mode === "login" ? "New to JARVIS?" : "Already have an account?"}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </span>
        </div>
        <div className="auth-security">
          <ShieldCheck size={15} />
          <span>Private by design · Secure server-side sessions</span>
        </div>
      </section>
      <p className="auth-footnote">
        AI features require a server-side provider configuration. Your credentials are never sent to
        the browser model.
      </p>
    </main>
  );
}
