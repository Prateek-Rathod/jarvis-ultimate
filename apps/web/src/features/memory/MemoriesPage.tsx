import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Plus, Sparkles, Trash2 } from "lucide-react";
import { apiRequest } from "../../lib/api";

type MemoryCategory = "preference" | "workflow" | "goal" | "project" | "fact";
interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const categories: { value: MemoryCategory; label: string }[] = [
  { value: "preference", label: "Preference" },
  { value: "workflow", label: "Workflow" },
  { value: "goal", label: "Goal" },
  { value: "project", label: "Project" },
  { value: "fact", label: "Fact" },
];

export function MemoriesPage() {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<MemoryCategory>("preference");
  const [error, setError] = useState("");
  const memoriesQuery = useQuery({
    queryKey: ["memories"],
    queryFn: () => apiRequest<Memory[]>("/api/v1/memories"),
  });
  const settingsQuery = useQuery({
    queryKey: ["memory-settings"],
    queryFn: () => apiRequest<{ enabled: boolean }>("/api/v1/memories/settings"),
  });
  const addMemory = useMutation({
    mutationFn: () =>
      apiRequest<Memory>("/api/v1/memories", {
        method: "POST",
        body: JSON.stringify({ content, category }),
      }),
    onSuccess: async () => {
      setContent("");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Memory could not be saved."),
  });
  const updateMemory = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest<Memory>(`/api/v1/memories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Memory could not be updated."),
  });
  const deleteMemory = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/v1/memories/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Memory could not be deleted."),
  });
  const updateSettings = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest<{ enabled: boolean }>("/api/v1/memories/settings", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["memory-settings"] });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Memory settings could not be updated."),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content.trim()) addMemory.mutate();
  }

  return (
    <div className="feature-page memory-page">
      <section className="page-intro">
        <div>
          <span className="eyebrow">PERSONALIZATION</span>
          <h1>Your memories</h1>
          <p>Choose the details JARVIS can use to make future conversations more relevant.</p>
        </div>
      </section>
      <section className="memory-control panel">
        <div className="memory-control-icon">
          <Brain size={18} />
        </div>
        <div className="memory-control-copy">
          <strong>Use saved memories in conversations</strong>
          <span>
            Only memories with a relevant keyword match are added to a chat. You can turn this off
            at any time.
          </span>
        </div>
        <button
          className={`toggle-switch ${settingsQuery.data?.enabled ? "toggle-on" : ""}`}
          type="button"
          role="switch"
          aria-checked={settingsQuery.data?.enabled ?? false}
          aria-label="Use saved memories in conversations"
          disabled={settingsQuery.isLoading || settingsQuery.isError || updateSettings.isPending}
          onClick={() => updateSettings.mutate(!settingsQuery.data?.enabled)}
        >
          <span />
        </button>
      </section>
      {settingsQuery.isError && (
        <div className="inline-error" role="alert">
          Memory settings could not be loaded.{" "}
          <button className="text-link" onClick={() => void settingsQuery.refetch()}>
            Retry
          </button>
        </div>
      )}
      <form className="memory-create panel" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">USER-CONTROLLED</span>
            <h2>Save a memory</h2>
          </div>
          <Sparkles size={16} className="memory-sparkle" />
        </div>
        <label className="memory-content-label" htmlFor="memory-content">
          What would you like JARVIS to remember?
        </label>
        <textarea
          id="memory-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1500}
          rows={3}
          placeholder="For example: I prefer concise meeting summaries with clear action items."
          required
        />
        <div className="memory-form-actions">
          <label className="memory-category-label">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as MemoryCategory)}
            >
              {categories.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <span className="memory-char-count">{content.length}/1500</span>
          <button
            className="primary-button"
            type="submit"
            disabled={!content.trim() || addMemory.isPending}
          >
            <Plus size={15} />
            {addMemory.isPending ? "Saving…" : "Save memory"}
          </button>
        </div>
      </form>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <section className="panel memory-list-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">YOUR SAVED DETAILS</span>
            <h2>
              Memory library{" "}
              <span className="heading-count">{memoriesQuery.data?.length ?? 0}</span>
            </h2>
          </div>
        </div>
        {memoriesQuery.isLoading ? (
          <div className="skeleton-lines">
            <i />
            <i />
            <i />
          </div>
        ) : memoriesQuery.isError ? (
          <div className="empty-state">
            <strong>Memories aren’t available right now.</strong>
            <span>Check your connection and try again.</span>
            <button className="subtle-button" onClick={() => void memoriesQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : memoriesQuery.data?.length ? (
          <ul className="memory-list">
            {memoriesQuery.data.map((memory) => (
              <li
                key={memory.id}
                className={`memory-item ${memory.enabled ? "" : "memory-disabled"}`}
              >
                <div className="memory-item-icon">
                  <Brain size={15} />
                </div>
                <div className="memory-item-copy">
                  <p>{memory.content}</p>
                  <div>
                    <span className={`memory-category memory-category-${memory.category}`}>
                      {categories.find((item) => item.value === memory.category)?.label ??
                        memory.category}
                    </span>
                    <span className="memory-date">
                      Saved {new Date(memory.createdAt).toLocaleDateString()}
                    </span>
                    {!memory.enabled && <span className="memory-paused">Not used in chats</span>}
                  </div>
                </div>
                <button
                  className={`memory-toggle ${memory.enabled ? "memory-toggle-on" : ""}`}
                  role="switch"
                  aria-checked={memory.enabled}
                  aria-label={`${memory.enabled ? "Disable" : "Enable"} memory`}
                  onClick={() => updateMemory.mutate({ id: memory.id, enabled: !memory.enabled })}
                >
                  <span />
                </button>
                <button
                  className="icon-button memory-delete"
                  aria-label="Delete memory"
                  onClick={() => deleteMemory.mutate(memory.id)}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Brain size={19} />
            </div>
            <strong>Your memory, your choice.</strong>
            <span>
              Saved details will appear here, and you can edit or remove them whenever you like.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
