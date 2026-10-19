import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Check,
  CircleUserRound,
  Eye,
  Moon,
  RotateCw,
  Settings2,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { apiRequest } from "../../lib/api";
import { applySpeechOptions, cancelSpeech, resolveSpeechOptions } from "../../lib/speechControls";
import type { User, UserPreferences } from "../../types";

const PREFERENCE_QUERY_KEY = ["preferences"];
const defaultPreferences: UserPreferences = {
  theme: "system",
  responseStyle: "balanced",
  memoryEnabled: false,
  autoSpeak: false,
  speechRate: 1,
  speechPitch: 1,
  speechVoice: null,
  reduceMotion: false,
};

export function SettingsPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechStatus, setSpeechStatus] = useState("");
  const speechTestSequenceRef = useRef(0);
  const preferencesQuery = useQuery({
    queryKey: PREFERENCE_QUERY_KEY,
    queryFn: () => apiRequest<UserPreferences>("/api/v1/preferences"),
  });
  const savePreference = useMutation({
    scope: { id: "user-preferences" },
    mutationFn: (update: Partial<UserPreferences>) =>
      apiRequest<UserPreferences>("/api/v1/preferences", {
        method: "PATCH",
        body: JSON.stringify(update),
      }),
    onSuccess: () => setSaveStatus("All changes saved."),
    onError: (cause: Error) => {
      setSaveStatus("");
      setSaveError(`${cause.message} Your settings could not be saved.`);
      void queryClient.invalidateQueries({ queryKey: PREFERENCE_QUERY_KEY });
    },
  });
  const preferences = preferencesQuery.data ?? defaultPreferences;

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refreshVoices = () => setVoices(window.speechSynthesis.getVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => {
      speechTestSequenceRef.current += 1;
      window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
      cancelSpeech(window.speechSynthesis);
    };
  }, []);

  function updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setSaveError("");
    setSaveStatus("Saving changes…");
    const latest = queryClient.getQueryData<UserPreferences>(PREFERENCE_QUERY_KEY) ?? preferences;
    queryClient.setQueryData<UserPreferences>(PREFERENCE_QUERY_KEY, { ...latest, [key]: value });
    const update: Partial<UserPreferences> = { [key]: value };
    savePreference.mutate(update);
  }

  function testVoice() {
    if (!preferences.autoSpeak) {
      setSpeechStatus("Enable “Speak AI Responses” before testing speech.");
      return;
    }
    if (!("speechSynthesis" in window)) {
      setSpeechStatus("Speech playback is unavailable in this browser.");
      return;
    }
    const sequence = ++speechTestSequenceRef.current;
    cancelSpeech(window.speechSynthesis);
    const utterance = new SpeechSynthesisUtterance(
      "Hello, this is how JARVIS will sound when reading a response.",
    );
    applySpeechOptions(utterance, resolveSpeechOptions(preferences, voices, navigator.language));
    utterance.onstart = () => {
      if (sequence === speechTestSequenceRef.current) setSpeechStatus("Playing voice sample.");
    };
    utterance.onend = () => {
      if (sequence === speechTestSequenceRef.current) setSpeechStatus("");
    };
    utterance.onerror = () => {
      if (sequence === speechTestSequenceRef.current) {
        setSpeechStatus("The selected voice could not be played.");
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  const speechSupported = "speechSynthesis" in window;

  return (
    <div className="feature-page settings-page">
      <section className="page-intro settings-intro">
        <div>
          <span className="eyebrow">PERSONAL WORKSPACE</span>
          <h1>Settings</h1>
          <p>Make JARVIS feel and sound the way you prefer.</p>
        </div>
        <span className="settings-save-status" role="status" aria-live="polite">
          {saveStatus && <Check size={14} />} {saveStatus}
        </span>
      </section>

      {preferencesQuery.isLoading && (
        <div className="settings-notice" role="status">
          Loading your preferences…
        </div>
      )}
      {preferencesQuery.isError && (
        <div className="settings-notice settings-notice-error" role="alert">
          <span>Your saved preferences could not be loaded. Defaults are shown for now.</span>
          <button type="button" onClick={() => void preferencesQuery.refetch()}>
            <RotateCw size={14} /> Retry
          </button>
        </div>
      )}
      {saveError && (
        <div className="settings-notice settings-notice-error" role="alert">
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      <section className="settings-section" aria-labelledby="appearance-title">
        <div className="settings-section-heading">
          <span className="settings-section-icon">
            <Moon size={17} />
          </span>
          <div>
            <h2 id="appearance-title">Appearance & accessibility</h2>
            <p>Choose how JARVIS looks and responds to motion preferences.</p>
          </div>
        </div>
        <div className="settings-grid">
          <label className="settings-field">
            <span>Theme</span>
            <small>System follows your device appearance setting.</small>
            <select
              value={preferences.theme}
              disabled={preferencesQuery.isLoading}
              onChange={(event) =>
                updatePreference("theme", event.target.value as UserPreferences["theme"])
              }
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <div className="settings-row">
            <div className="settings-copy">
              <strong>Reduce motion</strong>
              <span>Turn off nonessential transitions and animations.</span>
            </div>
            <SettingsToggle
              label="Reduce motion"
              checked={preferences.reduceMotion}
              disabled={preferencesQuery.isLoading}
              onChange={(value) => updatePreference("reduceMotion", value)}
            />
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="voice-settings-title">
        <div className="settings-section-heading">
          <span className="settings-section-icon">
            <AudioLines size={17} />
          </span>
          <div>
            <h2 id="voice-settings-title">Voice & speech</h2>
            <p>Control spoken replies and tune your browser’s speech voice.</p>
          </div>
        </div>
        <div className="settings-row settings-row-feature">
          <div className="settings-copy">
            <strong>Speak AI Responses</strong>
            <span>
              When enabled, JARVIS speaks its responses aloud. When disabled, responses remain
              available as text.
            </span>
          </div>
          <SettingsToggle
            label="Speak AI Responses"
            checked={preferences.autoSpeak}
            disabled={preferencesQuery.isLoading}
            onChange={(value) => {
              if (!value) {
                speechTestSequenceRef.current += 1;
                cancelSpeech(window.speechSynthesis);
                setSpeechStatus("");
              }
              updatePreference("autoSpeak", value);
            }}
          />
        </div>
        {!speechSupported && (
          <div className="settings-inline-note">
            Speech synthesis is not supported by this browser. Other settings are still saved.
          </div>
        )}
        <div className="settings-grid">
          <label className="settings-field">
            <span>Voice</span>
            <small>Voice names and availability vary by browser and operating system.</small>
            <select
              value={preferences.speechVoice ?? ""}
              disabled={!speechSupported || preferencesQuery.isLoading}
              onChange={(event) => updatePreference("speechVoice", event.target.value || null)}
            >
              <option value="">System default</option>
              {preferences.speechVoice &&
                !voices.some((voice) => voice.name === preferences.speechVoice) && (
                  <option value={preferences.speechVoice}>
                    Saved voice unavailable — using fallback
                  </option>
                )}
              {voices.map((voice) => (
                <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                  {voice.name} · {voice.lang}
                  {voice.default ? " · default" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-field settings-range-field">
            <label htmlFor="speech-rate">
              <span>Speech rate</span>
              <output>{preferences.speechRate.toFixed(2)}×</output>
            </label>
            <small>Adjust the pace of future spoken replies.</small>
            <input
              id="speech-rate"
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={preferences.speechRate}
              disabled={preferencesQuery.isLoading}
              onChange={(event) => updatePreference("speechRate", Number(event.target.value))}
            />
          </div>
          <div className="settings-field settings-range-field">
            <label htmlFor="speech-pitch">
              <span>Speech pitch</span>
              <output>{preferences.speechPitch.toFixed(2)}</output>
            </label>
            <small>Adjust the pitch where your browser supports it.</small>
            <input
              id="speech-pitch"
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={preferences.speechPitch}
              disabled={preferencesQuery.isLoading}
              onChange={(event) => updatePreference("speechPitch", Number(event.target.value))}
            />
          </div>
        </div>
        {speechSupported && voices.length === 0 && (
          <div className="settings-inline-note">
            No named voices are currently available. The browser’s default voice will be used.
          </div>
        )}
        <div className="settings-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={!speechSupported}
            onClick={testVoice}
          >
            <Volume2 size={15} /> Test selected voice
          </button>
          {speechSupported && window.speechSynthesis.speaking && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                speechTestSequenceRef.current += 1;
                cancelSpeech(window.speechSynthesis);
                setSpeechStatus("Speech stopped.");
              }}
            >
              <VolumeX size={15} /> Stop speech
            </button>
          )}
          <span className="settings-inline-status" role="status">
            {speechStatus}
          </span>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="ai-settings-title">
        <div className="settings-section-heading">
          <span className="settings-section-icon">
            <Settings2 size={17} />
          </span>
          <div>
            <h2 id="ai-settings-title">Chat & AI</h2>
            <p>Set the level of detail JARVIS uses in its replies.</p>
          </div>
        </div>
        <label className="settings-field settings-response-style">
          <span>Response style</span>
          <small>This preference changes the instructions used for new AI responses.</small>
          <select
            value={preferences.responseStyle}
            disabled={preferencesQuery.isLoading}
            onChange={(event) =>
              updatePreference(
                "responseStyle",
                event.target.value as UserPreferences["responseStyle"],
              )
            }
          >
            <option value="concise">Concise</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </section>

      <section className="settings-section" aria-labelledby="privacy-settings-title">
        <div className="settings-section-heading">
          <span className="settings-section-icon">
            <ShieldCheck size={17} />
          </span>
          <div>
            <h2 id="privacy-settings-title">Privacy & memory</h2>
            <p>Choose whether saved memories can personalize new conversations.</p>
          </div>
        </div>
        <p className="settings-privacy-copy">
          Saved memories are private to your account. You can review, remove, or disable their use
          from the existing Memory workspace.
        </p>
        <Link className="settings-link" to="/memory">
          <Eye size={15} /> Manage saved memories and personalization
        </Link>
      </section>

      <section className="settings-section" aria-labelledby="account-settings-title">
        <div className="settings-section-heading">
          <span className="settings-section-icon">
            <CircleUserRound size={17} />
          </span>
          <div>
            <h2 id="account-settings-title">Account</h2>
            <p>Signed-in profile for this workspace.</p>
          </div>
        </div>
        <dl className="settings-account">
          <div>
            <dt>Display name</dt>
            <dd>{user.displayName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function SettingsToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      className={`toggle-switch ${checked ? "toggle-on" : ""}`}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
