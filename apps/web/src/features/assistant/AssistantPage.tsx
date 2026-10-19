import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AudioLines,
  Bot,
  Check,
  ChevronDown,
  Copy,
  LoaderCircle,
  MessageSquarePlus,
  Mic,
  MicOff,
  Send,
  Square,
  StopCircle,
} from "lucide-react";
import { apiRequest, ApiError, buildApiUrl, getCsrfToken } from "../../lib/api";
import type { Conversation, Message } from "../../types";

const STREAM_REQUEST_TIMEOUT_MS = 130_000;

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResult>;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function AssistantPage({ voiceMode = false }: { voiceMode?: boolean }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionDraftRef = useRef("");
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const localMessageSequenceRef = useRef(0);
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiRequest<Conversation[]>("/api/v1/conversations"),
  });
  const activeConversationId =
    selectedId ?? (voiceMode ? null : conversationsQuery.data?.[0]?.id) ?? null;
  const messagesQuery = useQuery({
    queryKey: ["messages", activeConversationId],
    enabled: Boolean(activeConversationId),
    queryFn: () => apiRequest<Message[]>(`/api/v1/conversations/${activeConversationId}/messages`),
  });

  useEffect(() => {
    const messageScroll = messageScrollRef.current;
    if (messageScroll && shouldAutoScrollRef.current) {
      messageScroll.scrollTop = messageScroll.scrollHeight;
    }
  }, [activeConversationId, messages, messagesQuery.data]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  async function createConversation(clearMessages = true): Promise<string> {
    shouldAutoScrollRef.current = true;
    const conversation = await apiRequest<Conversation>("/api/v1/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    });
    setSelectedId(conversation.id);
    if (clearMessages) setMessages([]);
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    return conversation.id;
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>, retryContent?: string) {
    event?.preventDefault();
    const content = (retryContent ?? draft).trim();
    if (!content || sending) return;
    shouldAutoScrollRef.current = true;
    if (listening) recognitionRef.current?.stop();
    setDraft("");
    setError("");
    setSending(true);
    const now = new Date().toISOString();
    const localMessageId = ++localMessageSequenceRef.current;
    const userMessage: Message = {
      id: `local-user-${localMessageId}`,
      role: "user",
      content,
      status: "complete",
      createdAt: now,
    };
    const assistantMessage: Message = {
      id: `local-assistant-${localMessageId}`,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: now,
    };
    setMessages((current) => [
      ...(current.length ? current : (messagesQuery.data ?? [])),
      userMessage,
      assistantMessage,
    ]);
    let activeId = selectedId ?? conversationsQuery.data?.[0]?.id ?? null;

    let requestTimedOut = false;
    let timeoutId: number | undefined;
    try {
      const conversationId = activeId ?? (await createConversation(false));
      activeId = conversationId;
      const controller = new AbortController();
      abortRef.current = controller;
      timeoutId = window.setTimeout(() => {
        requestTimedOut = true;
        controller.abort();
      }, STREAM_REQUEST_TIMEOUT_MS);
      const response = await fetch(
        buildApiUrl(`/api/v1/conversations/${conversationId}/messages`),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() ?? "" },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? `The request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The server did not provide a response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let responseText = "";
      let streamError = "";
      let streamCompleted = false;

      const processBlock = (block: string) => {
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) return;
        const payload = JSON.parse(dataLines.join("\n")) as {
          delta?: string;
          code?: string;
          message?: string;
          done?: boolean;
        };
        if (eventName === "error") {
          streamError = payload.message ?? "The response stream failed.";
          return;
        }
        if (payload.done) {
          streamCompleted = true;
          return;
        }
        if (payload.delta) {
          responseText += payload.delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id ? { ...message, content: responseText } : message,
            ),
          );
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const blocks = pending.split(/\r?\n\r?\n/);
        pending = blocks.pop() ?? "";
        for (const block of blocks) processBlock(block);
      }
      pending += decoder.decode();
      if (pending.trim()) processBlock(pending);

      if (!streamCompleted && !streamError) {
        streamError = "The response ended before it completed. Please retry.";
      }
      if (streamError) throw new Error(streamError);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ? { ...message, status: "complete" } : message,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
      if (voiceMode && responseText) speak(responseText);
    } catch (cause) {
      const connectionFailure =
        cause instanceof TypeError ||
        (cause instanceof ApiError &&
          (cause.code === "API_UNAVAILABLE" || cause.code === "REQUEST_TIMEOUT"));
      if (connectionFailure || requestTimedOut) setDraft(content);
      if (cause instanceof DOMException && cause.name === "AbortError" && !requestTimedOut) {
        setMessages([]);
      } else {
        setError(
          requestTimedOut
            ? "The assistant request timed out. Check your conversation history before retrying."
            : cause instanceof TypeError
              ? "The API is temporarily unavailable. Check that the server is running, then retry."
              : cause instanceof Error
                ? cause.message
                : "The assistant could not complete that request.",
        );
        setMessages([]);
      }
      if (activeId) await queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      abortRef.current = null;
      setSending(false);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      composerRef.current?.focus();
    }
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setError(
        "Speech playback is not supported by this browser. You can still read the response here.",
      );
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      text.replace(/```[\s\S]*?```/g, "Code block omitted."),
    );
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function toggleRecognition() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    if (!Recognition) {
      setError(
        "Speech recognition is not supported by this browser. Use the text composer instead.",
      );
      return;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language;
    recognitionDraftRef.current = draft.trim();
    recognition.onresult = (event) => {
      const transcriptParts: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        transcriptParts.push(event.results[index][0].transcript.trim());
      }
      const transcript = transcriptParts.filter(Boolean).join(" ");
      if (transcript) {
        setDraft([recognitionDraftRef.current, transcript.trim()].filter(Boolean).join(" "));
      }
    };
    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone access was denied. You can type your message instead."
          : `Speech recognition error: ${event.error}.`,
      );
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("The microphone could not be started. Try again or use the text composer.");
    }
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError("Clipboard access is unavailable in this browser.");
    }
  }

  const visibleMessages = messages.length ? messages : (messagesQuery.data ?? []);

  return (
    <div className={`assistant-page ${voiceMode ? "assistant-voice-mode" : ""}`}>
      <aside className="conversation-rail">
        <div className="conversation-rail-heading">
          <div>
            <span className="eyebrow">JARVIS</span>
            <h2>Conversations</h2>
          </div>
          <button
            className="icon-button"
            onClick={() =>
              void createConversation().catch(() =>
                setError("A new conversation could not be created."),
              )
            }
            aria-label="New conversation"
          >
            <MessageSquarePlus size={17} />
          </button>
        </div>
        <button
          className="conversation-new"
          onClick={() =>
            void createConversation().catch(() =>
              setError("A new conversation could not be created."),
            )
          }
        >
          <MessageSquarePlus size={15} /> New conversation
        </button>
        <div className="conversation-list">
          {conversationsQuery.isLoading && (
            <span className="conversation-hint">Loading conversationsâ€¦</span>
          )}
          {conversationsQuery.isError && (
            <div className="conversation-hint">
              <span>Conversation history is unavailable.</span>
              <button
                className="conversation-history-retry"
                type="button"
                onClick={() => void conversationsQuery.refetch()}
              >
                Retry
              </button>
            </div>
          )}
          {conversationsQuery.data?.map((conversation) => (
            <button
              key={conversation.id}
              className={`conversation-item ${activeConversationId === conversation.id ? "conversation-item-active" : ""}`}
              aria-current={activeConversationId === conversation.id ? "true" : undefined}
              onClick={() => {
                shouldAutoScrollRef.current = true;
                setSelectedId(conversation.id);
                setMessages([]);
                setError("");
              }}
            >
              <span className="conversation-item-dot" />
              <span>{conversation.title}</span>
            </button>
          ))}
          {!conversationsQuery.isLoading && conversationsQuery.data?.length === 0 && (
            <span className="conversation-hint">Your saved conversations will appear here.</span>
          )}
        </div>
      </aside>
      <section className="chat-workspace">
        {voiceMode && (
          <div className="voice-mode-banner">
            <AudioLines className="voice-mode-icon" size={17} />
            <div className="voice-mode-copy">
              <span>VOICE MODE</span>
              <small>
                {Recognition
                  ? "Select shared conversation history to continue with voice. Speech recognition is handled by your browser and may use its provider."
                  : "Select shared conversation history to continue here. Voice input is unavailable in this browser, but you can type below."}
              </small>
            </div>
          </div>
        )}
        <header className="chat-header">
          <div className="assistant-avatar">
            <Bot size={19} />
          </div>
          <div className="chat-header-copy">
            <strong>JARVIS</strong>
            <span>
              <i className="online-dot" /> Personal assistant
            </span>
          </div>
          <button
            className="chat-model-button"
            onClick={() =>
              setError("Model selection is not available until a provider is configured.")
            }
          >
            AI provider <ChevronDown size={13} />
          </button>
        </header>
        <div
          className={`message-scroll ${messages.length || messagesQuery.data?.length ? "message-scroll-has-messages" : ""}`}
          ref={messageScrollRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            shouldAutoScrollRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
        >
          {messagesQuery.isLoading && activeConversationId && (
            <div className="message-loading">
              <LoaderCircle size={16} /> Loading conversationâ€¦
            </div>
          )}
          {messagesQuery.isError && activeConversationId && (
            <div className="chat-history-error" role="alert">
              <span>Conversation history could not be loaded.</span>
              <button type="button" onClick={() => void messagesQuery.refetch()}>
                Retry
              </button>
            </div>
          )}
          {!messagesQuery.isLoading &&
            !messagesQuery.isError &&
            !messages.length &&
            !messagesQuery.data?.length &&
            (voiceMode ? (
              <div className="chat-welcome voice-chat-welcome">
                <button
                  type="button"
                  className={`voice-mode-control ${listening ? "voice-mode-control-active" : ""}`}
                  onClick={toggleRecognition}
                  disabled={!Recognition || sending}
                  aria-label={listening ? "Stop voice input" : "Start voice input"}
                  aria-pressed={listening}
                >
                  {listening ? <MicOff size={23} /> : <Mic size={23} />}
                  <span>{!Recognition ? "Unavailable" : listening ? "Listeningâ€¦" : "Speak"}</span>
                </button>
                <span className="eyebrow">VOICE ASSISTANT</span>
                <h1>{listening ? "Iâ€™m listening." : "Speak to JARVIS"}</h1>
                <p>
                  {!Recognition
                    ? "Voice input is not supported here. Type a message below instead."
                    : listening
                      ? "Say what you need, then stop listening to review your transcript."
                      : "Tap the microphone to dictate a message. You can review it before sending."}
                </p>
              </div>
            ) : (
              <div className="chat-welcome">
                <div className="welcome-orb">
                  <Bot size={30} />
                </div>
                <span className="eyebrow">YOUR AI ASSISTANT</span>
                <h1>Where should we begin?</h1>
                <p>Ask a question, explore an idea, or work through your next step.</p>
                <div className="prompt-chips">
                  <button onClick={() => setDraft("Help me plan my priorities for today.")}>
                    Plan my day <ArrowIcon />
                  </button>
                  <button
                    onClick={() => setDraft("Help me break a complex problem into smaller steps.")}
                  >
                    Break down a problem <ArrowIcon />
                  </button>
                </div>
              </div>
            ))}
          {visibleMessages.map((message, index) => {
            const previousMessage = visibleMessages[index - 1];
            const retryContent =
              previousMessage?.role === "user" ? previousMessage.content : undefined;
            return (
              <article
                key={message.id}
                className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"}`}
              >
                {message.role === "assistant" && (
                  <div className="message-avatar">
                    <Bot size={15} />
                  </div>
                )}
                <div className="message-body">
                  <div className="message-meta">
                    <strong>{message.role === "assistant" ? "JARVIS" : "You"}</strong>
                    <time>
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <div
                    className={`message-content ${message.role === "assistant" ? "message-markdown" : "message-plain"}`}
                  >
                    {message.content ? (
                      message.role === "assistant" ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      ) : (
                        message.content
                      )
                    ) : message.status === "streaming" ? (
                      <span className="typing-indicator">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : null}
                  </div>
                  {message.role === "assistant" && message.status === "interrupted" && (
                    <div className="message-interrupted" role="status">
                      <span>This response was interrupted.</span>
                      {retryContent && (
                        <button
                          type="button"
                          onClick={() => void sendMessage(undefined, retryContent)}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                  {message.role === "assistant" &&
                    message.content &&
                    message.status !== "streaming" && (
                      <div className="message-tools">
                        <button onClick={() => void copyMessage(message)}>
                          {copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}
                          {copiedId === message.id ? "Copied" : "Copy"}
                        </button>
                        {voiceMode && (
                          <button onClick={() => speak(message.content)}>
                            <AudioLines size={13} /> Speak
                          </button>
                        )}
                      </div>
                    )}
                </div>
              </article>
            );
          })}
        </div>
        {error && (
          <div className="chat-error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              Ã—
            </button>
          </div>
        )}
        <form className="composer-wrap" onSubmit={(event) => void sendMessage(event)}>
          <div className="composer">
            <textarea
              ref={composerRef}
              aria-label="Message JARVIS"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={listening ? "Listeningâ€¦ say something" : "Message JARVISâ€¦"}
            />
            <div className="composer-controls">
              {Recognition &&
                (!voiceMode || messages.length > 0 || Boolean(messagesQuery.data?.length)) && (
                  <button
                    type="button"
                    className={`composer-icon ${listening ? "composer-listening" : ""}`}
                    onClick={toggleRecognition}
                    aria-label={listening ? "Stop listening" : "Start voice input"}
                  >
                    {listening ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>
                )}
              {speaking && (
                <button
                  type="button"
                  className="composer-icon"
                  aria-label="Stop speaking"
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    setSpeaking(false);
                  }}
                >
                  <StopCircle size={17} />
                </button>
              )}
              {voiceMode && speaking && (
                <span className="voice-speaking-status" role="status">
                  Speaking response
                </span>
              )}
              <span className="composer-hint">Enter to send Â· Shift + Enter for new line</span>
              {sending ? (
                <button
                  type="button"
                  className="send-button send-stop"
                  aria-label="Stop response"
                  onClick={() => abortRef.current?.abort()}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="send-button"
                  disabled={!draft.trim()}
                  aria-label="Send message"
                >
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
          <p className="composer-disclaimer">
            JARVIS can make mistakes. Verify important information.
          </p>
        </form>
      </section>
    </div>
  );
}

function ArrowIcon() {
  return <span aria-hidden="true">â†—</span>;
}
