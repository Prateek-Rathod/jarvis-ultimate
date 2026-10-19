export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "completed";
  priority: "low" | "medium" | "high";
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: string;
  createdAt: string;
}
