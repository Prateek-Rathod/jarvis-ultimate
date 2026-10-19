import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Circle, Plus, Trash2 } from "lucide-react";
import { apiRequest, ApiError } from "../../lib/api";
import type { Task } from "../../types";

export function TasksPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => apiRequest<Task[]>("/api/v1/tasks"),
  });
  const createTask = useMutation({
    mutationFn: () =>
      apiRequest<Task>("/api/v1/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          priority,
          ...(dueDate ? { dueAt: new Date(`${dueDate}T23:59:00`).toISOString() } : {}),
        }),
      }),
    onSuccess: async () => {
      setTitle("");
      setDueDate("");
      setPriority("medium");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : "Task could not be created."),
  });
  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "open" | "completed" }) =>
      apiRequest<Task>(`/api/v1/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Task could not be updated."),
  });
  const deleteTask = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/v1/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Task could not be deleted."),
  });
  const tasks = tasksQuery.data ?? [];
  const openTasks = tasks.filter((task) => task.status === "open");
  const completedTasks = tasks.filter((task) => task.status === "completed");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim()) createTask.mutate();
  }

  return (
    <div className="feature-page">
      <section className="page-intro">
        <div>
          <span className="eyebrow">PERSONAL PRODUCTIVITY</span>
          <h1>Your tasks</h1>
          <p>Keep the important things moving, one step at a time.</p>
        </div>
        <span className="task-count">{openTasks.length} open</span>
      </section>
      <form className="create-task-form" onSubmit={submit}>
        <div className="create-task-title">
          <Plus size={17} />
          <input
            aria-label="Task title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to get done?"
            maxLength={200}
            required
          />
        </div>
        <div className="create-task-controls">
          <label className="select-wrap">
            <span className="sr-only">Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as typeof priority)}
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
          </label>
          <label className="date-wrap">
            <CalendarDays size={14} />
            <span className="sr-only">Due date</span>
            <input
              type="date"
              aria-label="Due date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <button
            className="primary-button task-add-button"
            type="submit"
            disabled={createTask.isPending}
          >
            <Plus size={15} /> Add task
          </button>
        </div>
      </form>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <section className="panel task-list-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">IN PROGRESS</span>
            <h2>
              Open tasks <span className="heading-count">{openTasks.length}</span>
            </h2>
          </div>
        </div>
        {tasksQuery.isLoading ? (
          <div className="skeleton-lines">
            <i />
            <i />
            <i />
          </div>
        ) : tasksQuery.isError ? (
          <div className="empty-state">
            <strong>Tasks aren’t available right now.</strong>
            <span>Check that the API and database are configured, then try again.</span>
            <button className="subtle-button" onClick={() => void tasksQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : openTasks.length ? (
          <ul className="full-task-list">
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={() => updateTask.mutate({ id: task.id, status: "completed" })}
                onDelete={() => deleteTask.mutate(task.id)}
              />
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Check size={19} />
            </div>
            <strong>Nothing on your list.</strong>
            <span>Add a task above to make a little progress.</span>
          </div>
        )}
      </section>
      {completedTasks.length > 0 && (
        <section className="panel task-list-panel completed-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">DONE</span>
              <h2>
                Completed <span className="heading-count">{completedTasks.length}</span>
              </h2>
            </div>
          </div>
          <ul className="full-task-list">
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={() => updateTask.mutate({ id: task.id, status: "open" })}
                onDelete={() => deleteTask.mutate(task.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onComplete,
  onDelete,
}: {
  task: Task;
  onComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`full-task-row ${task.status === "completed" ? "task-completed" : ""}`}>
      <button
        className="task-check"
        onClick={onComplete}
        aria-label={task.status === "completed" ? `Reopen ${task.title}` : `Complete ${task.title}`}
      >
        {task.status === "completed" ? <Check size={14} /> : <Circle size={17} />}
      </button>
      <div className="full-task-copy">
        <strong>{task.title}</strong>
        {task.description && <span>{task.description}</span>}
        <div className="task-meta">
          <span className={`priority-tag priority-tag-${task.priority}`}>
            {task.priority} priority
          </span>
          {task.dueAt && (
            <span>
              <CalendarDays size={12} /> Due {new Date(task.dueAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <button
        className="icon-button task-delete"
        onClick={onDelete}
        aria-label={`Delete ${task.title}`}
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}
