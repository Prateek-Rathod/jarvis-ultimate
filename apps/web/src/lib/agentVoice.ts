export type AgentUtteranceIntent =
  | { type: "list_tasks" }
  | { type: "complete_task"; title: string }
  | { type: "delete_task"; title: string; ordinal?: number }
  | { type: "create_task"; title: string }
  | { type: "plan_day" }
  | { type: "reminder" }
  | { type: "agent_action" }
  | { type: "conversation" };

export interface AgentSearchContext {
  kind: "youtube" | "web" | "images";
  query: string;
}

export function getSearchContext(urlValue: string): AgentSearchContext | null {
  try {
    const url = new URL(urlValue);
    if (url.hostname === "www.youtube.com" && url.pathname === "/results") {
      const query = url.searchParams.get("search_query")?.trim();
      return query ? { kind: "youtube", query } : null;
    }
    if (url.hostname === "www.bing.com") {
      const kind =
        url.pathname === "/images/search" ? "images" : url.pathname === "/search" ? "web" : null;
      const query = url.searchParams.get("q")?.trim();
      return kind && query ? { kind, query } : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function isYouTubePlaybackRequest(instruction: string): boolean {
  const command = instruction
    .trim()
    .replace(/^jarvis[,:\s]+/i, "")
    .replace(/^(?:(?:can|could|would)\s+you|please)\s+/i, "")
    .replace(/^(?:i['’]d like to|i would like to|i want to)\s+/i, "");
  const match = /^(?:play|listen to|put on)\s+(.+?)(?:\s+(?:on|in)\s+youtube)?$/i.exec(command);
  const title = match?.[1]?.trim().replace(/^(?:a|some|the)\s+/i, "");
  return Boolean(title && !/^(?:song|music|songs)$/i.test(title));
}

export function shouldAutoOpenYouTubePlayback(instruction: string, url: string): boolean {
  return getSearchContext(url)?.kind === "youtube" && isYouTubePlaybackRequest(instruction);
}

export function refineSearchInstruction(
  context: AgentSearchContext,
  utterance: string,
): string | null {
  const refinement = utterance
    .trim()
    .replace(/^(?:and\s+)?(?:make it|narrow it|filter it|show me)\s+/i, "")
    .replace(/^only\s+/i, "")
    .replace(/\s+(?:ones|results|options)$/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  if (!refinement || refinement === utterance.trim()) return null;
  const query = `${context.query} ${refinement}`.trim();
  if (context.kind === "youtube") return `Search YouTube for ${query}`;
  if (context.kind === "images") return `Find images of ${query}`;
  return `Search the web for ${query}`;
}

export function getTaskCreationFollowUp(utterance: string): string | null {
  const match =
    /^(?:and\s+)?(?:now\s+)?(?:make|create|add)\s+(?:another|one|a task)\s+(?:for|to)\s+(.+?)[.!?]*$/i.exec(
      utterance.trim(),
    );
  return match?.[1]?.replace(/[.!?]+$/, "").trim() || null;
}

export function isSafeNavigationAddress(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      hostname.includes(".") &&
      !hostname.includes("..") &&
      !hostname.endsWith(".localhost") &&
      hostname !== "localhost" &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !hostname.endsWith(".home.arpa") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) &&
      !hostname.startsWith("[")
    );
  } catch {
    return false;
  }
}

function normalizeUtterance(utterance: string): string {
  return utterance
    .trim()
    .replace(/^jarvis[,:\s]+/i, "")
    .replace(/^(?:(?:(?:can|could|would)\s+you\s+)?please\s+|(?:can|could|would)\s+you\s+)/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

export function classifyAgentUtterance(utterance: string): AgentUtteranceIntent {
  const command = normalizeUtterance(utterance);

  const taskCreation =
    /^(?:(?:i\s+)?(?:need|want)\s+(?:a\s+)?task\s+(?:to|for)\s+|(?:create|add)\s+(?:me\s+)?(?:a\s+)?task\s+(?:to|for|called|named)\s+)(.+)$/i.exec(
      command,
    );
  if (taskCreation?.[1]?.trim()) {
    return { type: "create_task", title: taskCreation[1].trim() };
  }
  if (/^(?:(?:i\s+)?(?:need|want)\s+(?:a\s+)?task|create|add)\b/i.test(command)) {
    return { type: "agent_action" };
  }

  if (/\b(remind me|set (?:a )?reminder|create (?:a )?reminder)\b/i.test(command)) {
    return { type: "reminder" };
  }
  if (
    /\b(plan my day|plan (?:out )?today|daily plan|organize my tasks|organise my tasks)\b/i.test(
      command,
    )
  ) {
    return { type: "plan_day" };
  }
  if (
    /^(?:show|list|view|check)\s+(?:me\s+)?(?:my\s+)?(?:open\s+|pending\s+)?tasks?\b/i.test(
      command,
    ) ||
    /^(?:how many|what|which)\s+tasks?\b/i.test(command) ||
    /^(?:what|which)\s+tasks?\s+(?:do i have|are|remain|are left)\b/i.test(command)
  ) {
    return { type: "list_tasks" };
  }
  const createTask =
    /^(?:(?:i\s+)?(?:need|want)\s+(?:a\s+)?task\s+(?:to|for)\s+|(?:create|add)\s+(?:me\s+)?(?:a\s+)?task\s+(?:to|for|called|named)\s+)(.+)$/i.exec(
      command,
    );
  if (createTask?.[1]?.trim()) return { type: "create_task", title: createTask[1].trim() };
  if (/^(?:(?:i\s+)?(?:need|want)\s+(?:a\s+)?task|create|add)\b/i.test(command)) {
    return { type: "agent_action" };
  }
  if (
    /^show me\b/i.test(command) &&
    /\b(?:images?|pictures?|photos?|wallpapers?|inspiration|interfaces?)\b/i.test(command)
  ) {
    return { type: "agent_action" };
  }

  const completion =
    /^(?:mark|complete|finish|check off)\s+(?:my\s+|the\s+)?(?:task\s+)?(.+?)(?:\s+(?:as\s+)?(?:completed|complete|done))?$/i.exec(
      command,
    );
  if (completion?.[1]?.trim()) {
    return { type: "complete_task", title: completion[1].trim() };
  }

  const deletion =
    /^(?:delete|remove)\s+(?:my\s+|the\s+)?(?:task\s+(?:called\s+|named\s+|to\s+)?)?(.+)$/i.exec(
      command,
    );
  if (deletion?.[1]?.trim()) {
    const ordinalMatch =
      /^(?:number\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:st|nd|rd|th)?)$/i.exec(
        deletion[1].trim(),
      );
    const ordinalWords: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      sixth: 6,
      seventh: 7,
      eighth: 8,
      ninth: 9,
      tenth: 10,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    if (ordinalMatch) {
      const value = ordinalMatch[1]?.toLowerCase() ?? "";
      const ordinal = ordinalWords[value] ?? Number.parseInt(value, 10);
      if (Number.isInteger(ordinal) && ordinal > 0) {
        return { type: "delete_task", title: "", ordinal };
      }
    }
    return { type: "delete_task", title: deletion[1].trim() };
  }

  if (
    /\b(open|go to|take me to|launch|search|find|look for|look up|create|add|research|play|listen to|put on)\b/i.test(
      command,
    )
  ) {
    return { type: "agent_action" };
  }

  return { type: "conversation" };
}

export function transitionAgentVoiceState(
  current: AgentVoiceState,
  next: AgentVoiceState,
): AgentVoiceState {
  if (current === next) return current;
  if (!allowedTransitions[current].includes(next)) {
    throw new Error(`Invalid Agent Mode voice transition: ${current} -> ${next}`);
  }
  return next;
}

export type AgentVoiceState =
  | "idle"
  | "requesting_permission"
  | "wake_listening"
  | "activated"
  | "listening"
  | "processing"
  | "awaiting_clarification"
  | "executing"
  | "speaking"
  | "interrupted"
  | "error";

const allowedTransitions: Record<AgentVoiceState, AgentVoiceState[]> = {
  idle: ["requesting_permission", "processing", "error"],
  requesting_permission: ["wake_listening", "listening", "idle", "error"],
  wake_listening: ["activated", "requesting_permission", "idle", "error"],
  activated: ["speaking", "listening", "processing", "wake_listening", "idle", "error"],
  listening: [
    "requesting_permission",
    "activated",
    "wake_listening",
    "processing",
    "idle",
    "error",
  ],
  processing: [
    "executing",
    "awaiting_clarification",
    "speaking",
    "wake_listening",
    "idle",
    "interrupted",
    "error",
  ],
  awaiting_clarification: [
    "requesting_permission",
    "wake_listening",
    "processing",
    "executing",
    "speaking",
    "idle",
    "error",
  ],
  executing: [
    "awaiting_clarification",
    "speaking",
    "wake_listening",
    "idle",
    "interrupted",
    "error",
  ],
  speaking: [
    "requesting_permission",
    "wake_listening",
    "processing",
    "awaiting_clarification",
    "idle",
    "interrupted",
    "error",
  ],
  interrupted: ["requesting_permission", "wake_listening", "processing", "idle", "error"],
  error: ["requesting_permission", "wake_listening", "processing", "executing", "speaking", "idle"],
};
