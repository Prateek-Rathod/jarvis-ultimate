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

export interface UserPreferences {
  theme: "dark" | "light" | "system";
  responseStyle: "concise" | "balanced" | "detailed";
  memoryEnabled: boolean;
  autoSpeak: boolean;
  speechRate: number;
  speechPitch: number;
  speechVoice: string | null;
  reduceMotion: boolean;
}

export type AgentTaskStatus =
  | "queued"
  | "planning"
  | "awaiting_approval"
  | "running"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "needs_input"
  | "unsupported";

export interface AgentTaskStep {
  id: string;
  position: number;
  tool: string;
  description: string;
  risk: "low" | "medium" | "high";
  status: AgentTaskStatus;
  result: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AgentTask {
  id: string;
  instruction: string;
  status: AgentTaskStatus;
  result: string | null;
  createdAt: string;
  completedAt: string | null;
  steps: AgentTaskStep[];
}

export interface AgentCapabilities {
  enabled: boolean;
  tools: {
    name: string;
    description: string;
    risk: "low" | "medium" | "high";
    requiresConfirmation: boolean;
  }[];
}
