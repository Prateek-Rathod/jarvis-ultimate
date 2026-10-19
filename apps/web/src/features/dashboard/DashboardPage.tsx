import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AudioLines, Check, CheckSquare, Clock3, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import type { User } from "../../types";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface DashboardSummary {
  openTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
  completedTasks: number;
  recentTasks: {
    id: string;
    title: string;
    priority: "low" | "medium" | "high";
    dueAt: string | null;
  }[];
}

export function DashboardPage({ user }: { user: User }) {
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiRequest<DashboardSummary>("/api/v1/dashboard/summary"),
  });
  const summary = summaryQuery.data;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <span className="eyebrow">
            <span className="status-dot" /> PERSONAL WORKSPACE
          </span>
          <h1>
            {greeting()}, {user.displayName.split(" ")[0]}
            <span className="greeting-period">.</span>
          </h1>
          <p>
            {today} <span className="welcome-divider">·</span> Here’s your space to think clearly
            and move forward.
          </p>
        </div>
        <Link className="primary-button welcome-action" to="/voice">
          <Sparkles size={16} /> Ask JARVIS <ArrowRight size={15} />
        </Link>
      </section>
      <section className="stat-grid" aria-label="Task overview">
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon stat-icon-blue">
              <CheckSquare size={17} />
            </span>
            <span className="stat-label">OPEN TASKS</span>
          </div>
          <strong className="stat-value">
            {summaryQuery.isLoading ? "—" : summary?.openTasks}
          </strong>
          <span className="stat-caption">Across your workspace</span>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon stat-icon-red">
              <Clock3 size={17} />
            </span>
            <span className="stat-label">OVERDUE</span>
          </div>
          <strong className="stat-value">
            {summaryQuery.isLoading ? "—" : summary?.overdueTasks}
          </strong>
          <span className="stat-caption">Tasks past their due date</span>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon stat-icon-amber">
              <Sparkles size={17} />
            </span>
            <span className="stat-label">HIGH PRIORITY</span>
          </div>
          <strong className="stat-value">
            {summaryQuery.isLoading ? "—" : summary?.highPriorityTasks}
          </strong>
          <span className="stat-caption">Needs your attention</span>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon stat-icon-green">
              <Check size={17} />
            </span>
            <span className="stat-label">COMPLETED</span>
          </div>
          <strong className="stat-value">
            {summaryQuery.isLoading ? "—" : summary?.completedTasks}
          </strong>
          <span className="stat-caption">Tasks finished</span>
        </article>
      </section>
      <section className="dashboard-columns">
        <article className="panel task-preview">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">YOUR PRIORITIES</span>
              <h2>Open tasks</h2>
            </div>
            <Link to="/tasks" className="text-link">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {summaryQuery.isError ? (
            <div className="inline-error">
              Tasks could not be loaded. Check your connection and try again.
            </div>
          ) : summaryQuery.isLoading ? (
            <div className="skeleton-lines">
              <i />
              <i />
              <i />
            </div>
          ) : summary?.recentTasks.length ? (
            <ul className="task-preview-list">
              {summary.recentTasks.map((task) => (
                <li key={task.id}>
                  <span className={`task-priority priority-${task.priority}`} />
                  <div className="task-preview-copy">
                    <strong>{task.title}</strong>
                    <span>
                      {task.dueAt
                        ? `Due ${new Date(task.dueAt).toLocaleDateString()}`
                        : "No due date"}
                    </span>
                  </div>
                  <span className={`priority-tag priority-tag-${task.priority}`}>
                    {task.priority}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <CheckSquare size={20} />
              </div>
              <strong>A little room to breathe.</strong>
              <span>Your open tasks will show here when you add them.</span>
              <Link to="/tasks" className="text-link">
                Create a task <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </article>
        <article className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">QUICK ACCESS</span>
              <h2>Start something</h2>
            </div>
          </div>
          <div className="quick-actions">
            <Link to="/voice" className="quick-action">
              <span className="quick-action-icon quick-violet">
                <AudioLines size={17} />
              </span>
              <span>
                <strong>Talk to JARVIS</strong>
                <small>Speak or type naturally</small>
              </span>
              <ArrowRight size={15} />
            </Link>
            <Link to="/tasks" className="quick-action">
              <span className="quick-action-icon quick-green">
                <Plus size={17} />
              </span>
              <span>
                <strong>Create a task</strong>
                <small>Capture your next step</small>
              </span>
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="quick-note">
            <Sparkles size={14} />
            <span>Your conversations and tasks are saved to your account.</span>
          </div>
        </article>
      </section>
    </div>
  );
}
