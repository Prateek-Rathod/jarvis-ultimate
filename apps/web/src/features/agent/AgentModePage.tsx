import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Check,
  CircleAlert,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  RotateCw,
  ShieldCheck,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiRequest } from "../../lib/api";
import { monitorMicrophoneActivity } from "../../lib/audioActivity";
import { streamAgentConversation } from "../../lib/agentConversation";
import {
  classifyAgentUtterance,
  getTaskCreationFollowUp,
  getSearchContext,
  isSafeNavigationAddress,
  refineSearchInstruction,
  shouldAutoOpenYouTubePlayback,
  transitionAgentVoiceState,
  type AgentVoiceState,
  type AgentSearchContext,
} from "../../lib/agentVoice";
import { markdownToSpeech } from "../../lib/markdownToSpeech";
import ArmoredSuit from "./ArmoredSuit";
import { applySpeechOptions, cancelSpeech, resolveSpeechOptions } from "../../lib/speechControls";
import {
  getSpeechRecognitionConstructor,
  type SpeechRecognitionLike,
} from "../../lib/speechRecognition";
import { VoiceTranscriptSession } from "../../lib/voiceTranscript";
import {
  FinalTranscriptDeduplicator,
  getFinalTranscripts,
  resolveWakeCommand,
} from "../../lib/wakeWord";
import type {
  AgentCapabilities,
  AgentTask,
  AgentTaskStatus,
  Task,
  UserPreferences,
} from "../../types";

const AGENT_TASKS_KEY = ["agent-tasks"];
const AGENT_CAPABILITIES_KEY = ["agent-capabilities"];
const TASKS_KEY = ["tasks"];
const activeStatuses: AgentTaskStatus[] = ["queued", "planning", "running", "awaiting_approval"];

const stateLabels: Record<AgentVoiceState, string> = {
  idle: "SYSTEM STANDBY",
  requesting_permission: "MICROPHONE ACCESS",
  wake_listening: "WAKE WORD ACTIVE",
  activated: "JARVIS ACTIVATED",
  listening: "LISTENING",
  processing: "PROCESSING REQUEST",
  awaiting_clarification: "AWAITING CONFIRMATION",
  executing: "EXECUTING ACTION",
  speaking: "JARVIS SPEAKING",
  interrupted: "RESPONSE INTERRUPTED",
  error: "SYSTEM ALERT",
};

const statusLabels: Record<AgentTaskStatus, string> = {
  queued: "Queued",
  planning: "Understanding",
  awaiting_approval: "Awaiting approval",
  running: "Executing",
  verifying: "Verifying",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  timed_out: "Timed out",
  needs_input: "Needs more information",
  unsupported: "Not supported yet",
};

interface PendingNavigation {
  type: "navigation_confirmation";
  url: string;
  label: string;
}

interface TaskPage {
  tasks: Task[];
  pagination: { nextCursor: string | null };
}

interface TranscriptTurn {
  id: number;
  speaker: "you" | "jarvis";
  text: string;
}

function parsePendingNavigation(result: string | null): PendingNavigation | null {
  if (!result) return null;
  try {
    const parsed: unknown = JSON.parse(result);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<PendingNavigation>;
    if (
      candidate.type !== "navigation_confirmation" ||
      typeof candidate.url !== "string" ||
      typeof candidate.label !== "string"
    ) {
      return null;
    }
    if (!isSafeNavigationAddress(candidate.url)) return null;
    return { type: candidate.type, url: new URL(candidate.url).toString(), label: candidate.label };
  } catch {
    return null;
  }
}

function normalizeTaskTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reusableTaskPrefix(title: string): string {
  return (
    /^(?:study|revise|review|learn|practice|finish|read|prepare for)\s+/i.exec(title)?.[0] ?? ""
  );
}

function matchTasks(tasks: Task[], query: string): Task[] {
  const normalizedQuery = normalizeTaskTitle(
    query.replace(/\b(?:as\s+)?(?:done|complete|completed)\b$/i, ""),
  );
  return tasks.filter((task) => {
    const title = normalizeTaskTitle(task.title);
    return (
      title === normalizedQuery ||
      title.includes(normalizedQuery) ||
      normalizedQuery.includes(title)
    );
  });
}

function describeNavigation(url: string, label: string): string {
  const search = getSearchContext(url);
  if (search?.kind === "youtube") return `YouTube search results for ${search.query}`;
  if (search?.kind === "web") return `Bing search results for ${search.query}`;
  if (search?.kind === "images") return `Bing image results for ${search.query}`;
  return label;
}

export function AgentModePage() {
  const queryClient = useQueryClient();
  const [voiceState, setVoiceState] = useState<AgentVoiceState>("idle");
  const [busy, setBusy] = useState(false);
  const [conversationBusy, setConversationBusy] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [latestUtterance, setLatestUtterance] = useState("");
  const [transcriptPreview, setTranscriptPreview] = useState("");
  const [response, setResponse] = useState("");
  const [progress, setProgress] = useState("");
  const [muted, setMuted] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [awaitingWakeCommand, setAwaitingWakeCommand] = useState(false);
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [wakeActivated, setWakeActivated] = useState(false);
  const [successPulse, setSuccessPulse] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptTurns, setTranscriptTurns] = useState<TranscriptTurn[]>([]);
  const [pendingNavigationTask, setPendingNavigationTask] = useState<AgentTask | null>(null);
  const [taskCandidates, setTaskCandidates] = useState<Task[]>([]);
  const [candidateAction, setCandidateAction] = useState<"complete" | "delete" | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityPendingIds, setActivityPendingIds] = useState<Set<string>>(() => new Set());
  const mutedRef = useRef(false);
  const microphoneMutedRef = useRef(false);
  const callActiveRef = useRef(false);
  const handsFreeRef = useRef(false);
  const microphoneLevelRef = useRef(0);
  const wakeCommandPendingRef = useRef(false);
  const wakeDeduplicatorRef = useRef(new FinalTranscriptDeduplicator());
  const callSessionIdRef = useRef(0);
  const transcriptSequenceRef = useRef(0);
  const silenceAttemptsRef = useRef(0);
  const recognitionRetriesRef = useRef(0);
  const taskRequestsRef = useRef(new Set<string>());
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptSessionRef = useRef<VoiceTranscriptSession | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const stopAudioMonitorRef = useRef<(() => void) | null>(null);
  const recognitionRestartRef = useRef<number | null>(null);
  const successPulseTimeoutRef = useRef<number | null>(null);
  const wakeActivationTimeoutRef = useRef<number | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const requestKeysRef = useRef(new Map<string, string>());
  const lastSearchRef = useRef<AgentSearchContext | null>(null);
  const lastTaskCreationRef = useRef(false);
  const taskCreationPrefixRef = useRef("");
  const pendingSongSearchRef = useRef(false);
  const speechSequenceRef = useRef(0);
  const activeOperationRef = useRef(false);
  const activeOperationTypeRef = useRef<"conversation" | "agent" | "task" | null>(null);
  const conversationAbortRef = useRef<AbortController | null>(null);
  const navigationRequestRef = useRef(new Set<string>());
  const openedNavigationRef = useRef(new Set<string>());
  const activityRequestsRef = useRef(new Set<string>());
  const Recognition = getSpeechRecognitionConstructor();

  function updateWakeCommandPending(pending: boolean) {
    wakeCommandPendingRef.current = pending;
    setAwaitingWakeCommand(pending);
  }

  const capabilitiesQuery = useQuery({
    queryKey: AGENT_CAPABILITIES_KEY,
    queryFn: () => apiRequest<AgentCapabilities>("/api/v1/agent/capabilities"),
  });
  const preferencesQuery = useQuery({
    queryKey: ["preferences"],
    queryFn: () => apiRequest<UserPreferences>("/api/v1/preferences"),
  });
  const agentTasksQuery = useQuery({
    queryKey: AGENT_TASKS_KEY,
    queryFn: () => apiRequest<AgentTask[]>("/api/v1/agent/tasks"),
    enabled: capabilitiesQuery.data?.enabled === true,
    refetchInterval: (query) =>
      activeOperationRef.current ||
      query.state.data?.some((task) => activeStatuses.includes(task.status))
        ? 1_000
        : false,
  });

  function moveState(next: AgentVoiceState) {
    setVoiceState((current) => transitionAgentVoiceState(current, next));
  }

  function pulseSuccess() {
    if (successPulseTimeoutRef.current !== null) {
      window.clearTimeout(successPulseTimeoutRef.current);
    }
    if (wakeActivationTimeoutRef.current !== null) {
      window.clearTimeout(wakeActivationTimeoutRef.current);
    }
    setSuccessPulse(true);
    successPulseTimeoutRef.current = window.setTimeout(() => {
      successPulseTimeoutRef.current = null;
      setSuccessPulse(false);
    }, 900);
  }

  const stopRecognition = useCallback(() => {
    transcriptSessionRef.current?.cancel();
    transcriptSessionRef.current = null;
    setRecognitionActive(false);
    if (!recognitionRef.current) return;
    recognitionRef.current.onresult = null;
    recognitionRef.current.onerror = null;
    recognitionRef.current.onend = null;
    recognitionRef.current.abort();
    recognitionRef.current = null;
  }, []);

  const releaseMicrophone = useCallback(() => {
    if (recognitionRestartRef.current !== null) {
      window.clearTimeout(recognitionRestartRef.current);
      recognitionRestartRef.current = null;
    }
    stopRecognition();
    stopAudioMonitorRef.current?.();
    stopAudioMonitorRef.current = null;
    microphoneStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    microphoneStreamRef.current = null;
    microphoneLevelRef.current = 0;
    coreRef.current?.style.setProperty("--voice-scale", "0.25");
    coreRef.current?.style.setProperty("--voice-opacity", "0.22");
    coreRef.current?.style.setProperty("--core-scale", "1");
    coreRef.current?.style.setProperty("--voice-glow", "5px");
  }, [stopRecognition]);

  useEffect(
    () => () => {
      callActiveRef.current = false;
      callSessionIdRef.current += 1;
      releaseMicrophone();
      if (successPulseTimeoutRef.current !== null) {
        window.clearTimeout(successPulseTimeoutRef.current);
      }
      conversationAbortRef.current?.abort();
      speechSequenceRef.current += 1;
      cancelSpeech(window.speechSynthesis);
    },
    [releaseMicrophone],
  );

  function appendTranscript(speaker: TranscriptTurn["speaker"], text: string) {
    const entry = { id: ++transcriptSequenceRef.current, speaker, text };
    setTranscriptTurns((current) => [...current.slice(-39), entry]);
  }

  function resumeListeningAfterResponse(sessionId: number, force = false) {
    if (
      !callActiveRef.current ||
      callSessionIdRef.current !== sessionId ||
      microphoneMutedRef.current ||
      (!handsFreeRef.current && !force)
    ) {
      return;
    }
    if (recognitionRestartRef.current !== null) {
      window.clearTimeout(recognitionRestartRef.current);
    }
    recognitionRestartRef.current = window.setTimeout(() => {
      recognitionRestartRef.current = null;
      startListening();
    }, 350);
  }

  function speakResponse(
    message: string,
    returnTo: AgentVoiceState = "idle",
    resumeAfterSpeech = true,
  ) {
    setResponse(message);
    setProgress("");
    if (!callActiveRef.current) {
      moveState(returnTo);
      return;
    }
    const plainText = markdownToSpeech(message);
    if (plainText) appendTranscript("jarvis", plainText);
    const sessionId = callSessionIdRef.current;
    if (mutedRef.current || !message.trim()) {
      moveState(returnTo);
      if (resumeAfterSpeech) resumeListeningAfterResponse(sessionId);
      return;
    }
    if (!("speechSynthesis" in window)) {
      setVoiceError(
        "Spoken responses are unavailable in this browser. The response is shown on screen.",
      );
      moveState("error");
      return;
    }

    const spokenText = plainText;
    if (!spokenText) {
      moveState("idle");
      return;
    }
    cancelSpeech(window.speechSynthesis);
    const sequence = ++speechSequenceRef.current;
    const utterance = new SpeechSynthesisUtterance(spokenText);
    const preferences = preferencesQuery.data ?? {
      speechVoice: null,
      speechRate: 1,
      speechPitch: 1,
    };
    applySpeechOptions(
      utterance,
      resolveSpeechOptions(preferences, window.speechSynthesis.getVoices(), navigator.language),
    );
    utterance.onstart = () => {
      if (sequence === speechSequenceRef.current) moveState("speaking");
    };
    utterance.onend = () => {
      if (sequence === speechSequenceRef.current) {
        moveState(returnTo);
        if (resumeAfterSpeech) resumeListeningAfterResponse(sessionId);
      }
    };
    utterance.onerror = () => {
      if (sequence === speechSequenceRef.current) {
        setVoiceError("JARVIS could not play the spoken response. You can still read it here.");
        moveState("error");
        if (resumeAfterSpeech) resumeListeningAfterResponse(sessionId);
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  async function askAssistant(message: string, context: string | undefined, sessionId: number) {
    activeOperationTypeRef.current = "conversation";
    setConversationBusy(true);
    setProgress("Thinking…");
    const controller = new AbortController();
    let timedOut = false;
    conversationAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 130_000);
    try {
      const result = await streamAgentConversation({
        content: message,
        conversationId: conversationIdRef.current,
        ...(context ? { context } : {}),
        signal: controller.signal,
        onDelta: (partial) => {
          if (callSessionIdRef.current === sessionId) setResponse(partial);
        },
      });
      if (callSessionIdRef.current !== sessionId) return;
      conversationIdRef.current = result.conversationId;
      if (!result.response.trim()) {
        speakResponse("I didn’t receive a response. Please try again.");
        return;
      }
      speakResponse(result.response);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["messages", result.conversationId] }),
      ]);
    } catch {
      if (callSessionIdRef.current !== sessionId) return;
      if (controller.signal.aborted) {
        if (timedOut) {
          setVoiceError("The AI response timed out. You can try your request again.");
          moveState("error");
        } else if (voiceState !== "interrupted") {
          moveState("interrupted");
        }
        setProgress("");
      } else {
        setVoiceError("I couldn’t connect to JARVIS. Please try again.");
        moveState("error");
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (conversationAbortRef.current === controller) conversationAbortRef.current = null;
      if (callSessionIdRef.current === sessionId) {
        activeOperationRef.current = false;
        activeOperationTypeRef.current = null;
        setConversationBusy(false);
      }
      if (callSessionIdRef.current === sessionId && controller.signal.aborted && !timedOut) {
        resumeListeningAfterResponse(sessionId);
      }
    }
  }

  async function getTasks(status?: "open") {
    const query = status ? "?status=open&limit=100" : "?limit=100";
    const result = await apiRequest<TaskPage>(`/api/v1/tasks${query}`);
    return result.tasks;
  }

  async function completeTask(task: Task) {
    const sessionId = callSessionIdRef.current;
    if (taskRequestsRef.current.has(task.id)) return;
    taskRequestsRef.current.add(task.id);
    activeOperationRef.current = true;
    activeOperationTypeRef.current = "task";
    setBusy(true);
    moveState("executing");
    setTaskCandidates([]);
    setCandidateAction(null);
    setProgress("Updating task…");
    try {
      const updated = await apiRequest<Task>(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      await queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      if (callSessionIdRef.current !== sessionId) return;
      pulseSuccess();
      speakResponse(`I marked “${updated.title}” as completed.`);
    } catch {
      if (callSessionIdRef.current !== sessionId) return;
      setVoiceError("I couldn’t update that task. Please try again.");
      moveState("error");
    } finally {
      taskRequestsRef.current.delete(task.id);
      if (callSessionIdRef.current === sessionId) {
        activeOperationRef.current = false;
        activeOperationTypeRef.current = null;
        setBusy(false);
      }
    }
  }

  async function deleteTask(task: Task) {
    const sessionId = callSessionIdRef.current;
    if (taskRequestsRef.current.has(task.id)) return;
    taskRequestsRef.current.add(task.id);
    activeOperationRef.current = true;
    activeOperationTypeRef.current = "task";
    setBusy(true);
    moveState("executing");
    setPendingDeleteTask(null);
    setProgress("Deleting task…");
    try {
      await apiRequest<{ deleted: boolean }>(`/api/v1/tasks/${task.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      if (callSessionIdRef.current !== sessionId) return;
      pulseSuccess();
      speakResponse(`I deleted the task “${task.title}”.`);
    } catch {
      if (callSessionIdRef.current !== sessionId) return;
      setVoiceError("I couldn’t delete that task. Please try again.");
      moveState("error");
    } finally {
      taskRequestsRef.current.delete(task.id);
      if (callSessionIdRef.current === sessionId) {
        activeOperationRef.current = false;
        activeOperationTypeRef.current = null;
        setBusy(false);
      }
    }
  }

  async function handleUtterance(utterance: string) {
    const cleanUtterance = utterance.trim();
    if (!cleanUtterance || !callActiveRef.current || activeOperationRef.current) {
      return;
    }
    const sessionId = callSessionIdRef.current;
    silenceAttemptsRef.current = 0;
    activeOperationRef.current = true;
    setBusy(true);
    setLatestUtterance(cleanUtterance);
    appendTranscript("you", cleanUtterance);
    setTranscriptPreview("");
    setVoiceError("");
    setProgress("Thinking…");
    moveState("processing");

    const taskFollowUp = lastTaskCreationRef.current
      ? getTaskCreationFollowUp(cleanUtterance)
      : null;
    if (lastTaskCreationRef.current && !taskFollowUp) {
      lastTaskCreationRef.current = false;
      taskCreationPrefixRef.current = "";
    }
    if (taskFollowUp) {
      const title = `${taskCreationPrefixRef.current}${taskFollowUp}`.trim();
      const instruction = `Create task: ${title}`;
      try {
        moveState("executing");
        setProgress("Creating follow-up task…");
        let key = requestKeysRef.current.get(instruction);
        if (!key) {
          key = crypto.randomUUID();
          requestKeysRef.current.set(instruction, key);
        }
        const task = await apiRequest<AgentTask>("/api/v1/agent/tasks", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ instruction }),
        });
        requestKeysRef.current.delete(instruction);
        await queryClient.invalidateQueries({ queryKey: AGENT_TASKS_KEY });
        if (callSessionIdRef.current !== sessionId) return;
        if (task.status === "completed") {
          pulseSuccess();
          const createdTitle = /^Added "(.+)" to your JARVIS task list\.$/.exec(
            task.result ?? "",
          )?.[1];
          taskCreationPrefixRef.current = createdTitle ? reusableTaskPrefix(createdTitle) : "";
          lastTaskCreationRef.current = true;
          speakResponse(task.result ?? `I created the task “${title}”.`);
        } else {
          lastTaskCreationRef.current = false;
          speakResponse(task.result ?? "I couldn’t create that follow-up task.");
        }
      } catch {
        if (callSessionIdRef.current !== sessionId) return;
        setVoiceError("I couldn’t create the follow-up task. Please try again.");
        moveState("error");
      } finally {
        if (callSessionIdRef.current === sessionId) {
          activeOperationRef.current = false;
          activeOperationTypeRef.current = null;
          setBusy(false);
        }
      }
      return;
    }

    const initialIntent = classifyAgentUtterance(cleanUtterance);
    const clarifiedSong = pendingSongSearchRef.current && initialIntent.type === "conversation";
    if (pendingSongSearchRef.current) pendingSongSearchRef.current = false;
    if (
      clarifiedSong &&
      /^(?:cancel|never mind|nevermind|forget it|stop)(?:\s|$)/i.test(cleanUtterance)
    ) {
      speakResponse("Okay. I won’t search for a song.");
      activeOperationRef.current = false;
      activeOperationTypeRef.current = null;
      setBusy(false);
      return;
    }

    const refinement =
      lastSearchRef.current && refineSearchInstruction(lastSearchRef.current, cleanUtterance);
    if (refinement) {
      try {
        moveState("executing");
        setProgress("Refining search…");
        const key = crypto.randomUUID();
        const task = await apiRequest<AgentTask>("/api/v1/agent/tasks", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ instruction: refinement }),
        });
        await queryClient.invalidateQueries({ queryKey: AGENT_TASKS_KEY });
        if (callSessionIdRef.current !== sessionId) return;
        const navigation =
          task.status === "awaiting_approval" ? parsePendingNavigation(task.result) : null;
        if (navigation) lastSearchRef.current = getSearchContext(navigation.url);
        setPendingNavigationTask(task.status === "awaiting_approval" ? task : null);
        const answer = navigation
          ? `I’ll open refined ${navigation.label} results for you. Confirm below to continue.`
          : (task.result ?? "I couldn’t refine that search.");
        if (navigation) moveState("awaiting_clarification");
        speakResponse(answer, navigation ? "awaiting_clarification" : "idle", !navigation);
      } catch {
        if (callSessionIdRef.current !== sessionId) return;
        setVoiceError("I couldn’t refine that search. Please try again.");
        moveState("error");
      } finally {
        if (callSessionIdRef.current === sessionId) {
          activeOperationRef.current = false;
          activeOperationTypeRef.current = null;
          setBusy(false);
        }
      }
      return;
    }

    const intent = initialIntent;
    try {
      if (intent.type === "list_tasks") {
        activeOperationTypeRef.current = "task";
        const tasks = await getTasks("open");
        if (callSessionIdRef.current !== sessionId) return;
        await queryClient.invalidateQueries({ queryKey: TASKS_KEY });
        const taskSummary = tasks
          .slice(0, 8)
          .map((task) => task.title)
          .join("; ");
        speakResponse(
          tasks.length
            ? `${tasks.length === 100 ? "You have at least 100" : `You have ${tasks.length}`} open ${tasks.length === 1 ? "task" : "tasks"}: ${taskSummary}${tasks.length === 100 ? "; there may be more in your task list" : tasks.length > 8 ? `; and ${tasks.length - 8} more are in your task list` : ""}.`
            : "You don’t have any open tasks right now.",
        );
        return;
      }
      if (intent.type === "complete_task" || intent.type === "delete_task") {
        activeOperationTypeRef.current = "task";
        const tasks = await getTasks(intent.type === "complete_task" ? "open" : undefined);
        if (callSessionIdRef.current !== sessionId) return;
        const matches =
          intent.type === "delete_task" && intent.ordinal
            ? tasks[intent.ordinal - 1]
              ? [tasks[intent.ordinal - 1]!]
              : []
            : matchTasks(tasks, intent.title);
        if (matches.length === 0) {
          speakResponse(
            intent.type === "delete_task" && intent.ordinal
              ? `I couldn’t find task number ${intent.ordinal}.`
              : `I couldn’t find an ${intent.type === "complete_task" ? "open " : ""}task matching “${intent.title}”.`,
          );
          return;
        }
        if (matches.length > 1) {
          setTaskCandidates(matches);
          setCandidateAction(intent.type === "complete_task" ? "complete" : "delete");
          moveState("awaiting_clarification");
          setProgress("");
          speakResponse(
            `I found ${matches.length} matching tasks. Select the exact task${intent.type === "delete_task" ? " to review deletion" : " to complete"} below.`,
            "awaiting_clarification",
            false,
          );
          return;
        }
        const [task] = matches;
        if (!task) {
          speakResponse("I couldn’t identify that task. Please try again.");
          return;
        }
        if (intent.type === "complete_task") {
          await completeTask(task);
        } else {
          setPendingDeleteTask(task);
          moveState("awaiting_clarification");
          setProgress("");
          speakResponse(
            `Please confirm before I delete “${task.title}”.`,
            "awaiting_clarification",
            false,
          );
        }
        return;
      }
      if (intent.type === "plan_day") {
        activeOperationTypeRef.current = "conversation";
        const tasks = await getTasks("open");
        if (callSessionIdRef.current !== sessionId) return;
        const taskContext = tasks.length
          ? `Use this list of the user's current open tasks as the source for the plan:\n${tasks.map((task) => `- ${task.title}${task.dueAt ? ` (due ${new Date(task.dueAt).toLocaleString()})` : ""}`).join("\n")}\nCreate a realistic suggested plan, but do not claim it was saved to a calendar.`
          : "There are no open tasks in the user's task list. Do not invent tasks or claim to add calendar events.";
        await askAssistant(cleanUtterance, taskContext, sessionId);
        return;
      }
      if (intent.type === "reminder") {
        setProgress("");
        moveState("awaiting_clarification");
        setPendingDeleteTask(null);
        speakResponse("Sorry, boss. I can’t set reminders yet.");
        return;
      }
      if (intent.type === "agent_action" || intent.type === "create_task" || clarifiedSong) {
        activeOperationTypeRef.current = "agent";
        moveState("executing");
        setProgress(
          intent.type === "create_task" || /^(?:create|add)\s+(?:a\s+)?task\b/i.test(cleanUtterance)
            ? "Creating task…"
            : /\bplay\b/i.test(cleanUtterance)
              ? "Searching YouTube…"
              : /\b(?:search|find|look up)\b/i.test(cleanUtterance)
                ? "Searching…"
                : /\b(?:open|launch|go to)\b/i.test(cleanUtterance)
                  ? "Opening…"
                  : "Working…",
        );
        const actionInstruction =
          intent.type === "create_task"
            ? `Create task: ${intent.title}`
            : clarifiedSong
              ? `Play ${cleanUtterance} on YouTube`
              : cleanUtterance;
        let key = requestKeysRef.current.get(actionInstruction);
        if (!key) {
          key = crypto.randomUUID();
          requestKeysRef.current.set(actionInstruction, key);
        }
        const task = await apiRequest<AgentTask>("/api/v1/agent/tasks", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ instruction: actionInstruction }),
        });
        requestKeysRef.current.delete(actionInstruction);
        await queryClient.invalidateQueries({ queryKey: AGENT_TASKS_KEY });
        if (callSessionIdRef.current !== sessionId) return;
        if (task.status === "awaiting_approval") {
          lastTaskCreationRef.current = false;
          taskCreationPrefixRef.current = "";
          const navigation = parsePendingNavigation(task.result);
          if (navigation && shouldAutoOpenYouTubePlayback(actionInstruction, navigation.url)) {
            setPendingNavigationTask(null);
            moveState("executing");
            setProgress("Opening YouTube…");
            const confirmedTask = await apiRequest<AgentTask>(
              `/api/v1/agent/tasks/${task.id}/confirm-navigation`,
              { method: "POST" },
            );
            if (callSessionIdRef.current !== sessionId) return;
            if (confirmedTask.status !== "completed") {
              throw new Error("YouTube navigation was not confirmed.");
            }
            window.location.assign(navigation.url);
            return;
          }
          setPendingNavigationTask(task);
          moveState("awaiting_clarification");
          setProgress("");
          lastSearchRef.current = navigation ? getSearchContext(navigation.url) : null;
          const label = navigation
            ? describeNavigation(navigation.url, navigation.label)
            : "that website";
          const answer = `I’m ready to open ${label}. Confirm below to continue.`;
          setResponse(answer);
          speakResponse(answer, "awaiting_clarification", false);
        } else if (task.status === "completed") {
          pulseSuccess();
          lastTaskCreationRef.current =
            intent.type === "create_task" ||
            /^(?:create|add)\s+(?:a\s+)?task\b/i.test(cleanUtterance);
          const createdTitle = /^Added "(.+)" to your JARVIS task list\.$/.exec(
            task.result ?? "",
          )?.[1];
          taskCreationPrefixRef.current = createdTitle ? reusableTaskPrefix(createdTitle) : "";
          speakResponse(
            createdTitle
              ? `Done, boss. I’ve created your task to ${createdTitle}.`
              : (task.result ?? "Done, boss."),
          );
        } else {
          lastTaskCreationRef.current = false;
          taskCreationPrefixRef.current = "";
          pendingSongSearchRef.current =
            task.status === "needs_input" &&
            /\b(?:play|listen|put on)\b/i.test(actionInstruction) &&
            /\b(?:song|music|artist)\b/i.test(task.result ?? "");
          const message =
            task.status === "needs_input"
              ? (task.result ?? "I need a little more information.")
              : task.status === "unsupported"
                ? (task.result ?? "I can’t perform that action yet.")
                : (task.result ?? "The action did not complete.");
          speakResponse(message, task.status === "needs_input" ? "awaiting_clarification" : "idle");
        }
        return;
      }

      await askAssistant(cleanUtterance, undefined, sessionId);
    } catch {
      if (callSessionIdRef.current !== sessionId) return;
      setVoiceError("I couldn’t complete that request. Please try again.");
      setProgress("");
      moveState("error");
    } finally {
      if (callSessionIdRef.current === sessionId) {
        activeOperationRef.current = false;
        activeOperationTypeRef.current = null;
        setBusy(false);
      }
    }
  }

  function handleSilence(sessionId: number) {
    if (
      !callActiveRef.current ||
      microphoneMutedRef.current ||
      callSessionIdRef.current !== sessionId
    ) {
      return;
    }
    silenceAttemptsRef.current += 1;
    setProgress("");
    if (silenceAttemptsRef.current > 3) {
      silenceAttemptsRef.current = 0;
      moveState("idle");
      setVoiceError("I didn’t hear anything. Tap the microphone to listen again.");
      return;
    }
    moveState("idle");
    recognitionRestartRef.current = window.setTimeout(() => {
      recognitionRestartRef.current = null;
      startListening();
    }, 700 * silenceAttemptsRef.current);
  }

  function startListening() {
    if (
      !callActiveRef.current ||
      microphoneMutedRef.current ||
      recognitionRef.current ||
      activeOperationRef.current
    ) {
      return;
    }
    if (!Recognition) {
      setVoiceError(
        "Speech recognition is not supported in this browser. Try a supported browser with microphone access.",
      );
      moveState("error");
      return;
    }
    if (!capabilitiesQuery.data?.enabled) return;
    const sessionId = callSessionIdRef.current;
    const handsFreeSession = handsFreeRef.current;
    speechSequenceRef.current += 1;
    cancelSpeech(window.speechSynthesis);
    if (voiceState === "speaking") moveState("idle");
    moveState("requesting_permission");
    const recognition = new Recognition();
    recognition.continuous = handsFreeSession;
    recognition.interimResults = true;
    recognition.lang = navigator.language;
    const transcriptSession = handsFreeSession
      ? null
      : new VoiceTranscriptSession("", (text) => void handleUtterance(text));
    let recognitionFailed = false;
    let recognitionHandled = false;
    recognitionRef.current = recognition;
    setRecognitionActive(false);
    transcriptSessionRef.current = transcriptSession;
    recognition.onstart = () => {
      if (callSessionIdRef.current !== sessionId) return;
      setRecognitionActive(true);
      setVoiceError("");
      setVoiceNotice((current) =>
        current === "Speech recognition paused; JARVIS is reconnecting." ? "" : current,
      );
      moveState(
        handsFreeRef.current && !wakeCommandPendingRef.current ? "wake_listening" : "listening",
      );
    };
    recognition.onresult = (event) => {
      const segments: Array<{ transcript: string; isFinal: boolean }> = [];
      const firstResult = handsFreeSession ? event.resultIndex : 0;
      for (let index = firstResult; index < event.results.length; index += 1) {
        segments.push({
          transcript: event.results[index][0].transcript,
          isFinal: event.results[index].isFinal,
        });
      }
      if (handsFreeSession) {
        const finalized = getFinalTranscripts(segments).filter((transcript) =>
          wakeDeduplicatorRef.current.shouldProcess(transcript),
        );
        if (finalized.length === 0) return;
        recognitionRetriesRef.current = 0;
        const resolution = resolveWakeCommand(finalized, wakeCommandPendingRef.current);
        if (resolution.type === "ignore") return;

        recognitionHandled = true;
        stopRecognition();
        setWakeActivated(true);
        if (wakeActivationTimeoutRef.current !== null) {
          window.clearTimeout(wakeActivationTimeoutRef.current);
        }
        wakeActivationTimeoutRef.current = window.setTimeout(() => {
          wakeActivationTimeoutRef.current = null;
          setWakeActivated(false);
        }, 1_400);

        if (resolution.type === "command") {
          updateWakeCommandPending(false);
          moveState("activated");
          void handleUtterance(resolution.text);
        } else {
          updateWakeCommandPending(true);
          moveState("activated");
          speakResponse("I’m listening, boss.", "wake_listening");
        }
        return;
      }

      if (!transcriptSession) return;
      const transcript = transcriptSession.update(segments);
      setTranscriptPreview(transcript);
      if (segments.some((segment) => segment.isFinal && segment.transcript.trim())) setProgress("");
    };
    recognition.onerror = (event) => {
      transcriptSession?.fail();
      recognitionRef.current = null;
      setRecognitionActive(false);
      const permissionFailure =
        event.error === "not-allowed" || event.error === "service-not-allowed";
      if (handsFreeSession && !permissionFailure) {
        recognitionFailed = false;
        setVoiceNotice("Speech recognition paused; JARVIS is reconnecting.");
        return;
      }
      recognitionFailed = true;
      if (permissionFailure) {
        handsFreeRef.current = false;
        setHandsFree(false);
        updateWakeCommandPending(false);
      }
      if (event.error === "no-speech") {
        handleSilence(sessionId);
        return;
      }
      setVoiceError(
        permissionFailure
          ? "Browser speech recognition access was denied. Check browser speech settings, then try again."
          : event.error === "no-speech"
            ? "I didn’t hear anything. Tap the microphone and try again."
            : `Speech recognition failed (${event.error}). Check your microphone and try again.`,
      );
      setProgress("");
      moveState("error");
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setRecognitionActive(false);
      if (recognitionFailed) return;
      if (handsFreeSession && handsFreeRef.current && callActiveRef.current) {
        recognitionRetriesRef.current += 1;
        if (recognitionRetriesRef.current > 5) {
          handsFreeRef.current = false;
          setHandsFree(false);
          setVoiceError(
            "Speech recognition kept disconnecting. Hands-free listening stopped; tap to retry.",
          );
          moveState("error");
          return;
        }
        if (recognitionRestartRef.current !== null) {
          window.clearTimeout(recognitionRestartRef.current);
        }
        const retryDelay = Math.min(450 * 2 ** (recognitionRetriesRef.current - 1), 8_000);
        recognitionRestartRef.current = window.setTimeout(() => {
          recognitionRestartRef.current = null;
          startListening();
        }, retryDelay);
        return;
      }
      if (!transcriptSession) return;
      const hadFinalTranscript = transcriptSession.hasFinalTranscript();
      transcriptSession.finish();
      if (!hadFinalTranscript && !recognitionHandled) {
        handleSilence(sessionId);
      }
    };
    try {
      recognition.start();
    } catch {
      transcriptSession?.cancel();
      recognitionRef.current = null;
      setRecognitionActive(false);
      setVoiceError(
        "The microphone could not be started. Check browser permissions and try again.",
      );
      moveState("error");
    }
  }

  async function startCall(enableHandsFree = false) {
    if (callActiveRef.current) {
      endCall();
      return;
    }
    if (!Recognition) {
      setVoiceError(
        "Speech recognition is not supported in this browser. Try a current browser with microphone access.",
      );
      moveState("error");
      return;
    }
    if (!capabilitiesQuery.data?.enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError(
        "Microphone access is unavailable in this browser or page context. Use HTTPS or localhost and try a supported browser.",
      );
      moveState("error");
      return;
    }

    const sessionId = callSessionIdRef.current + 1;
    callSessionIdRef.current = sessionId;
    callActiveRef.current = true;
    handsFreeRef.current = enableHandsFree;
    setCallActive(true);
    setHandsFree(enableHandsFree);
    setVoiceError("");
    setVoiceNotice("");
    setLatestUtterance("");
    setTranscriptPreview("");
    moveState("requesting_permission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!callActiveRef.current || callSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      microphoneStreamRef.current = stream;
      setMicrophonePermission("granted");
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !microphoneMutedRef.current;
        track.onended = () => {
          if (!callActiveRef.current || callSessionIdRef.current !== sessionId) return;
          endCall();
          setVoiceError("The microphone disconnected. Start a new call to continue.");
          moveState("error");
        };
      });
      try {
        stopAudioMonitorRef.current = monitorMicrophoneActivity(
          stream,
          (level) => {
            microphoneLevelRef.current = level;
            coreRef.current?.style.setProperty("--voice-scale", (0.25 + level * 1.4).toFixed(3));
            coreRef.current?.style.setProperty("--voice-opacity", (0.22 + level * 0.68).toFixed(3));
            coreRef.current?.style.setProperty("--core-scale", (1 + level * 0.08).toFixed(3));
            coreRef.current?.style.setProperty("--voice-glow", `${5 + level * 20}px`);
            coreRef.current?.style.setProperty(
              "--skull-wave-opacity",
              (0.2 + level * 0.62).toFixed(3),
            );
            coreRef.current?.style.setProperty("--skull-wave-width", `${1 + level * 1.3}px`);
            coreRef.current?.style.setProperty(
              "--skull-particle-opacity",
              (0.45 + level * 0.6).toFixed(3),
            );
          },
          undefined,
          () => {
            if (callActiveRef.current && callSessionIdRef.current === sessionId) {
              setVoiceNotice(
                "Microphone level visualization is unavailable in this browser. Voice input can still work.",
              );
            }
          },
        );
      } catch {
        if (callActiveRef.current && callSessionIdRef.current === sessionId) {
          setVoiceNotice(
            "Microphone level visualization is unavailable in this browser. Voice input can still work.",
          );
        }
      }
      if (callActiveRef.current && callSessionIdRef.current === sessionId) startListening();
    } catch (cause) {
      if (callSessionIdRef.current !== sessionId) return;
      callActiveRef.current = false;
      handsFreeRef.current = false;
      setCallActive(false);
      setHandsFree(false);
      releaseMicrophone();
      const errorName = cause instanceof DOMException ? cause.name : "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        setMicrophonePermission("denied");
      }
      setVoiceError(
        errorName === "NotAllowedError" || errorName === "SecurityError"
          ? "Microphone access was denied. Allow microphone access in your browser’s site settings, then try again."
          : errorName === "NotFoundError"
            ? "No microphone was found. Connect a microphone and try again."
            : "The microphone could not be started. Check browser permissions and try again.",
      );
      moveState("error");
    }
  }

  async function toggleHandsFree() {
    if (!callActiveRef.current) {
      await startCall(true);
      return;
    }
    if (handsFreeRef.current) {
      handsFreeRef.current = false;
      updateWakeCommandPending(false);
      setHandsFree(false);
      setWakeActivated(false);
      if (recognitionRestartRef.current !== null) {
        window.clearTimeout(recognitionRestartRef.current);
        recognitionRestartRef.current = null;
      }
      stopRecognition();
      moveState("idle");
      setVoiceNotice("Wake-word listening is off. Tap the microphone when you want to speak.");
      return;
    }
    handsFreeRef.current = true;
    updateWakeCommandPending(false);
    wakeDeduplicatorRef.current.clear();
    setHandsFree(true);
    setVoiceNotice("");
    stopRecognition();
    startListening();
  }

  function endCall() {
    if (!callActiveRef.current) return;
    callActiveRef.current = false;
    handsFreeRef.current = false;
    updateWakeCommandPending(false);
    callSessionIdRef.current += 1;
    setCallActive(false);
    setHandsFree(false);
    setWakeActivated(false);
    setSuccessPulse(false);
    if (successPulseTimeoutRef.current !== null) {
      window.clearTimeout(successPulseTimeoutRef.current);
      successPulseTimeoutRef.current = null;
    }
    if (wakeActivationTimeoutRef.current !== null) {
      window.clearTimeout(wakeActivationTimeoutRef.current);
      wakeActivationTimeoutRef.current = null;
    }
    wakeDeduplicatorRef.current.clear();
    setMicrophoneMuted(false);
    microphoneMutedRef.current = false;
    releaseMicrophone();
    conversationAbortRef.current?.abort();
    conversationAbortRef.current = null;
    speechSequenceRef.current += 1;
    cancelSpeech(window.speechSynthesis);
    activeOperationRef.current = false;
    activeOperationTypeRef.current = null;
    setBusy(false);
    setConversationBusy(false);
    setProgress("");
    lastSearchRef.current = null;
    lastTaskCreationRef.current = false;
    taskCreationPrefixRef.current = "";
    pendingSongSearchRef.current = false;
    moveState("idle");
  }

  function toggleMicrophoneMute() {
    if (!callActiveRef.current) return;
    const nextMuted = !microphoneMutedRef.current;
    microphoneMutedRef.current = nextMuted;
    setMicrophoneMuted(nextMuted);
    microphoneStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    if (nextMuted) {
      stopRecognition();
      moveState("idle");
    } else {
      startListening();
    }
  }

  function stopSpeaking() {
    speechSequenceRef.current += 1;
    cancelSpeech(window.speechSynthesis);
    if (voiceState === "speaking") moveState("interrupted");
    if (callActiveRef.current) {
      resumeListeningAfterResponse(callSessionIdRef.current, true);
    }
  }

  function interruptConversation() {
    if (activeOperationTypeRef.current !== "conversation") return;
    conversationAbortRef.current?.abort();
    setVoiceError("Response stopped.");
    if (voiceState !== "interrupted") moveState("interrupted");
  }

  function openPendingNavigation(task: AgentTask) {
    if (navigationRequestRef.current.has(task.id)) return;
    const navigation = parsePendingNavigation(task.result);
    if (!navigation) {
      setVoiceError("This pending destination is invalid. No page was opened.");
      moveState("error");
      return;
    }
    if (!openedNavigationRef.current.has(task.id)) {
      const tab = window.open(navigation.url, "_blank");
      if (!tab) {
        setVoiceError(
          "Your browser blocked the new tab. Allow pop-ups for JARVIS, then try again.",
        );
        moveState("error");
        return;
      }
      try {
        tab.opener = null;
        openedNavigationRef.current.add(task.id);
      } catch {
        setVoiceError("The browser could not open that destination.");
        moveState("error");
        return;
      }
    }
    navigationRequestRef.current.add(task.id);
    setBusy(true);
    moveState("executing");
    void apiRequest<AgentTask>(`/api/v1/agent/tasks/${task.id}/confirm-navigation`, {
      method: "POST",
    })
      .then((confirmedTask) => {
        if (confirmedTask.status !== "completed") {
          throw new Error("Navigation was not confirmed.");
        }
        setPendingNavigationTask(null);
        openedNavigationRef.current.delete(task.id);
        void queryClient.invalidateQueries({ queryKey: AGENT_TASKS_KEY });
        pulseSuccess();
        const search = getSearchContext(navigation.url);
        const opened = describeNavigation(navigation.url, navigation.label);
        speakResponse(
          search?.kind === "youtube"
            ? `I’ve opened ${opened}, boss. Playback hasn’t started.`
            : search
              ? `I’ve opened ${opened}, boss. I haven’t fetched or analyzed those results.`
              : `I’ve opened ${navigation.label} in a new tab, boss.`,
        );
      })
      .catch(() => {
        setVoiceError(
          "The browser was instructed to open the page, but execution history could not be confirmed.",
        );
        moveState("error");
      })
      .finally(() => {
        navigationRequestRef.current.delete(task.id);
        setBusy(false);
      });
  }

  function cancelPendingNavigation(task: AgentTask) {
    if (navigationRequestRef.current.has(task.id)) return;
    navigationRequestRef.current.add(task.id);
    setBusy(true);
    moveState("executing");
    void apiRequest<AgentTask>(`/api/v1/agent/tasks/${task.id}/cancel`, { method: "POST" })
      .then(() => {
        setPendingNavigationTask(null);
        void queryClient.invalidateQueries({ queryKey: AGENT_TASKS_KEY });
        speakResponse(
          openedNavigationRef.current.has(task.id)
            ? "I cancelled the pending navigation record, but your browser may already have opened the page."
            : "I cancelled the pending navigation. No page was opened.",
        );
      })
      .catch(() => {
        setVoiceError("The navigation could not be cancelled. Please try again.");
        moveState("error");
      })
      .finally(() => {
        navigationRequestRef.current.delete(task.id);
        setBusy(false);
      });
  }

  async function runActivityMutation(taskId: string, operation: "cancel" | "delete") {
    if (activityRequestsRef.current.has(taskId)) return;
    activityRequestsRef.current.add(taskId);
    setActivityPendingIds((current) => new Set(current).add(taskId));
    try {
      const path =
        operation === "cancel"
          ? `/api/v1/agent/tasks/${taskId}/cancel`
          : `/api/v1/agent/tasks/${taskId}`;
      await apiRequest(path, { method: operation === "cancel" ? "POST" : "DELETE" });
      void queryClient.invalidateQueries({ queryKey: AGENT_TASKS_KEY });
    } catch {
      setVoiceError(
        operation === "cancel"
          ? "This action could not be cancelled. Please try again."
          : "Activity could not be deleted. Please try again.",
      );
    } finally {
      activityRequestsRef.current.delete(taskId);
      setActivityPendingIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }

  const capabilities = capabilitiesQuery.data;
  const tasks = agentTasksQuery.data ?? [];

  return (
    <main className={`agent-world agent-world-${voiceState}`} data-state={voiceState}>
      <div className="agent-world-backdrop" aria-hidden="true" />
      <header className="agent-world-header">
        <div className="agent-world-brand-group">
          <span className="agent-world-corner-brand">J.A.R.V.I.S.</span>
          <Link to="/" className="agent-return-button">
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </Link>
        </div>
        <div className="agent-world-controls">
          <button
            type="button"
            className={`agent-world-icon-button ${handsFree ? "agent-world-hands-free-active" : ""}`}
            aria-label={handsFree ? "Turn hands-free mode off" : "Turn hands-free mode on"}
            aria-pressed={handsFree}
            onClick={() => void toggleHandsFree()}
            disabled={!capabilities?.enabled || !Recognition}
          >
            <Activity size={17} />
            <span>Hands-free {handsFree ? "On" : "Off"}</span>
          </button>
          <button
            type="button"
            className={`agent-world-icon-button agent-world-microphone-permission-${microphonePermission}`}
            title={`Microphone permission: ${microphonePermission}`}
            aria-label={
              !callActive
                ? `Microphone permission: ${microphonePermission}`
                : microphoneMuted
                  ? "Unmute microphone"
                  : "Mute microphone"
            }
            aria-pressed={microphoneMuted}
            onClick={toggleMicrophoneMute}
            disabled={!callActive}
          >
            {microphoneMuted ? <MicOff size={17} /> : <Mic size={17} />}
            <span>
              {microphonePermission === "denied"
                ? "Microphone denied"
                : microphoneMuted
                  ? "Mic muted"
                  : "Microphone"}
            </span>
          </button>
          <button
            type="button"
            className="agent-world-icon-button"
            aria-label={muted ? "Unmute spoken responses" : "Mute spoken responses"}
            aria-pressed={muted}
            onClick={() => {
              const nextMuted = !mutedRef.current;
              mutedRef.current = nextMuted;
              setMuted(nextMuted);
              if (nextMuted) stopSpeaking();
            }}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            <span>{muted ? "Unmute" : "Mute"}</span>
          </button>
          <button
            type="button"
            className="agent-world-icon-button"
            aria-expanded={activityOpen}
            onClick={() => setActivityOpen((current) => !current)}
          >
            <Activity size={17} />
            <span>Activity</span>
          </button>
          <button
            type="button"
            className="agent-world-end-call"
            onClick={endCall}
            disabled={!callActive}
          >
            <PhoneOff size={15} />
            <span>End Call</span>
          </button>
        </div>
      </header>

      <section className="agent-world-stage" aria-label="JARVIS voice assistant">
        <div className="agent-world-identity">
          <span className="agent-world-wordmark">JARVIS</span>
          <span className="agent-world-subtitle">PERSONAL AI SYSTEM</span>
          <span
            className={`agent-world-status agent-world-status-${capabilitiesQuery.isError || (capabilities && !capabilities.enabled) ? "error" : capabilitiesQuery.isLoading ? "processing" : voiceState}`}
            role="status"
            aria-live="polite"
          >
            <i aria-hidden="true" />
            {capabilitiesQuery.isLoading
              ? "Connecting to Agent service"
              : capabilitiesQuery.isError
                ? "Agent service unavailable"
                : capabilities?.enabled
                  ? !callActive
                    ? "SYSTEM STANDBY · TAP TO CONNECT"
                    : microphoneMuted
                      ? "Microphone muted"
                      : wakeActivated
                        ? "JARVIS ACTIVATED"
                        : handsFree && awaitingWakeCommand
                          ? "LISTENING FOR COMMAND"
                          : handsFree && voiceState === "wake_listening"
                            ? "WAKE WORD ACTIVE"
                            : stateLabels[voiceState]
                  : "Agent Mode unavailable"}
          </span>
        </div>

        <div
          ref={coreRef}
          className={`agent-core agent-core-${voiceState}${successPulse ? " agent-core-success" : ""}`}
          aria-hidden="true"
        >
          <div className="agent-core-halo" />
          <div className="agent-core-ring agent-core-ring-outer" />
          <div className="agent-core-ring agent-core-ring-middle" />
          <div className="agent-core-ring agent-core-ring-inner" />
          <ArmoredSuit state={voiceState} />
        </div>

        <div className="agent-world-conversation" aria-live="polite" aria-atomic="true">
          {latestUtterance && (
            <p className="agent-world-utterance">
              <span>You</span>
              {transcriptPreview || latestUtterance}
            </p>
          )}
          {response && (
            <div className="agent-world-response">
              <span>JARVIS</span>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
            </div>
          )}
          {progress && <p className="agent-world-progress">{progress}</p>}
        </div>
        {transcriptTurns.length > 0 && (
          <details
            className="agent-world-transcript"
            open={transcriptOpen}
            onToggle={(event) => setTranscriptOpen(event.currentTarget.open)}
          >
            <summary>
              Conversation history ·{" "}
              {transcriptTurns.filter((turn) => turn.speaker === "you").length} turns
            </summary>
            <ol>
              {transcriptTurns.map((turn) => (
                <li key={turn.id} className={`agent-transcript-${turn.speaker}`}>
                  <span>{turn.speaker === "you" ? "YOU" : "JARVIS"}</span>
                  <p>{turn.text}</p>
                </li>
              ))}
            </ol>
          </details>
        )}

        {capabilities && !capabilities.enabled && (
          <div className="agent-world-notice" role="alert">
            <ShieldCheck size={16} />
            <span>Agent Mode is unavailable right now.</span>
          </div>
        )}
        {voiceNotice && (
          <div className="agent-world-notice" role="status">
            <Activity size={15} />
            <span>{voiceNotice}</span>
            <button type="button" onClick={() => setVoiceNotice("")}>
              Dismiss
            </button>
          </div>
        )}
        {capabilitiesQuery.isError && (
          <div className="agent-world-notice" role="alert">
            <CircleAlert size={16} />
            <span>Agent Mode could not connect. Check the API connection and retry.</span>
            <button type="button" onClick={() => void capabilitiesQuery.refetch()}>
              <RotateCw size={14} /> Retry
            </button>
          </div>
        )}
        {!Recognition && (
          <div className="agent-world-notice" role="status">
            <CircleAlert size={16} />
            <span>
              Voice input is not supported by this browser. Try a current browser with speech
              recognition.
            </span>
          </div>
        )}
        {voiceError && (
          <div className="agent-world-error" role="alert">
            <span>{voiceError}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setVoiceError("")}>
              <X size={15} />
            </button>
          </div>
        )}

        {pendingNavigationTask && (
          <div className="agent-world-confirm" role="group" aria-label="Confirm website navigation">
            <span>
              Open{" "}
              <strong>
                {parsePendingNavigation(pendingNavigationTask.result)?.label ?? "this website"}
              </strong>{" "}
              in a new tab?
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => openPendingNavigation(pendingNavigationTask)}
            >
              <ExternalLink size={15} /> Confirm and open
            </button>
            <button
              type="button"
              className="agent-world-confirm-cancel"
              disabled={busy}
              onClick={() => cancelPendingNavigation(pendingNavigationTask)}
            >
              Cancel
            </button>
          </div>
        )}

        {taskCandidates.length > 0 && (
          <div className="agent-world-task-choices" role="group" aria-label="Choose a task">
            {taskCandidates.map((task) => (
              <button
                type="button"
                key={task.id}
                disabled={busy}
                onClick={() => {
                  if (candidateAction === "complete") void completeTask(task);
                  else {
                    setTaskCandidates([]);
                    setCandidateAction(null);
                    setPendingDeleteTask(task);
                    moveState("awaiting_clarification");
                    speakResponse(
                      `Please confirm before I delete “${task.title}”.`,
                      "awaiting_clarification",
                      false,
                    );
                  }
                }}
              >
                {task.title}
              </button>
            ))}
          </div>
        )}
        {pendingDeleteTask && (
          <div className="agent-world-confirm" role="group" aria-label="Confirm task deletion">
            <span>
              Delete <strong>{pendingDeleteTask.title}</strong> from your task list?
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteTask(pendingDeleteTask)}
            >
              <Trash2 size={15} /> Delete task
            </button>
            <button
              type="button"
              className="agent-world-confirm-cancel"
              disabled={busy}
              onClick={() => {
                setPendingDeleteTask(null);
                speakResponse("I kept the task. Nothing was deleted.");
              }}
            >
              Keep task
            </button>
          </div>
        )}

        <div className="agent-world-controls-row">
          <button
            type="button"
            className={`agent-world-microphone ${voiceState === "listening" || voiceState === "requesting_permission" ? "agent-world-microphone-active" : ""}`}
            onClick={() => {
              if (!callActive) {
                void startCall(false);
              } else if (microphoneMuted) {
                toggleMicrophoneMute();
              } else if (!handsFree && !recognitionRef.current) {
                startListening();
              } else {
                toggleMicrophoneMute();
              }
            }}
            disabled={!callActive && (!capabilities?.enabled || !Recognition)}
            aria-label={
              callActive
                ? microphoneMuted
                  ? "Unmute microphone"
                  : handsFree
                    ? "Mute microphone"
                    : recognitionActive
                      ? "Mute microphone"
                      : "Start listening"
                : "Start voice call"
            }
            aria-pressed={callActive && !microphoneMuted}
          >
            {microphoneMuted ? <MicOff size={25} /> : <Mic size={25} />}
          </button>
          <span className="agent-world-mic-label">
            {!callActive
              ? "Start voice call"
              : microphoneMuted
                ? "Microphone muted · tap to unmute"
                : voiceState === "listening"
                  ? "Listening"
                  : voiceState === "requesting_permission"
                    ? "Allow microphone access"
                    : voiceState === "speaking"
                      ? "JARVIS is speaking"
                      : voiceState === "processing" || voiceState === "executing"
                        ? "Working on your request"
                        : "Ready for your next turn"}
          </span>
          {voiceState === "speaking" && (
            <button type="button" className="agent-world-stop" onClick={stopSpeaking}>
              <Square size={13} fill="currentColor" /> Interrupt and listen
            </button>
          )}
          {callActive && !microphoneMuted && voiceError && !busy && (
            <button
              type="button"
              className="agent-world-stop"
              onClick={() => {
                setVoiceError("");
                startListening();
              }}
            >
              <RotateCw size={13} /> Resume listening
            </button>
          )}
          {voiceState === "processing" && conversationBusy && (
            <button type="button" className="agent-world-stop" onClick={interruptConversation}>
              <Square size={13} fill="currentColor" /> Stop response
            </button>
          )}
        </div>
      </section>

      {activityOpen && (
        <aside className="agent-world-activity" aria-label="Agent activity history">
          <div className="agent-world-activity-heading">
            <div>
              <span className="agent-world-subtitle">VERIFIED ACTIONS</span>
              <h2>Recent activity</h2>
            </div>
            <button
              type="button"
              aria-label="Close activity"
              onClick={() => setActivityOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          {agentTasksQuery.isLoading ? (
            <p className="agent-world-activity-state">
              <LoaderCircle size={15} /> Loading activity…
            </p>
          ) : agentTasksQuery.isError ? (
            <div className="agent-world-activity-state">
              <span>Activity could not be loaded.</span>
              <button type="button" onClick={() => void agentTasksQuery.refetch()}>
                Retry
              </button>
            </div>
          ) : tasks.length ? (
            <div className="agent-task-list">
              {tasks.map((task) => (
                <AgentTaskCard
                  key={task.id}
                  task={task}
                  onCancel={() => void runActivityMutation(task.id, "cancel")}
                  cancelPending={activityPendingIds.has(task.id)}
                  onDelete={() => void runActivityMutation(task.id, "delete")}
                  deletePending={activityPendingIds.has(task.id)}
                  onConfirmNavigation={() => setPendingNavigationTask(task)}
                />
              ))}
            </div>
          ) : (
            <div className="agent-world-activity-state">
              <Clock3 size={16} />
              <span>Confirmed actions will appear here.</span>
            </div>
          )}
        </aside>
      )}
    </main>
  );
}

function AgentTaskCard({
  task,
  onCancel,
  cancelPending,
  onDelete,
  deletePending,
  onConfirmNavigation,
}: {
  task: AgentTask;
  onCancel: () => void;
  cancelPending: boolean;
  onDelete: () => void;
  deletePending: boolean;
  onConfirmNavigation: () => void;
}) {
  const active = activeStatuses.includes(task.status);
  const pendingNavigation =
    task.status === "awaiting_approval" ? parsePendingNavigation(task.result) : null;
  const terminalIcon =
    task.status === "completed" ? (
      <Check size={14} />
    ) : active ? (
      <Clock3 size={14} />
    ) : (
      <CircleAlert size={14} />
    );

  return (
    <details
      className={`agent-task-card agent-task-${task.status}`}
      open={Boolean(pendingNavigation)}
    >
      <summary>
        <span className="agent-task-status-icon">{terminalIcon}</span>
        <span className="agent-task-main">
          <strong>{task.instruction}</strong>
          <small>
            <span className={`agent-status-dot agent-status-${task.status}`} />
            {statusLabels[task.status]} · {new Date(task.createdAt).toLocaleString()}
          </small>
        </span>
        {active && (
          <button
            type="button"
            className="agent-cancel-button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }}
            disabled={cancelPending}
          >
            {cancelPending ? <LoaderCircle size={14} /> : <Square size={12} />}
            Cancel
          </button>
        )}
        {!active && (
          <button
            type="button"
            className="agent-delete-button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete();
            }}
            disabled={deletePending}
            aria-label={`Delete history for ${task.instruction}`}
          >
            {deletePending ? <LoaderCircle size={14} /> : <Trash2 size={14} />}
          </button>
        )}
      </summary>
      <div className="agent-task-detail">
        {pendingNavigation && (
          <div className="agent-navigation-confirm">
            <span>
              Open <strong>{pendingNavigation.label}</strong> in a new tab?
            </span>
            <button type="button" className="secondary-button" onClick={onConfirmNavigation}>
              <ExternalLink size={14} /> Confirm and open
            </button>
          </div>
        )}
        {task.steps.length > 0 && (
          <ol className="agent-timeline">
            {task.steps.map((step) => (
              <li key={step.id} className={`agent-step agent-step-${step.status}`}>
                <span className="agent-step-marker">
                  {step.status === "completed" ? <Check size={12} /> : <span />}
                </span>
                <div>
                  <strong>{step.description}</strong>
                  <small>
                    {step.tool === "planner" ? "Planning" : `${step.risk}-risk action`} ·{" "}
                    {statusLabels[step.status]}
                  </small>
                  {step.result && <p>{step.result}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {task.result && !pendingNavigation && <p className="agent-task-result">{task.result}</p>}
        {task.completedAt && (
          <time className="agent-task-completed">
            Updated {new Date(task.completedAt).toLocaleString()}
          </time>
        )}
      </div>
    </details>
  );
}
