import { isIP } from "node:net";
import { z } from "zod";

export function isSafeNavigationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const localHostname =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".home.arpa");
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      hostname.includes(".") &&
      !hostname.includes("..") &&
      !isIP(hostname) &&
      !localHostname
    );
  } catch {
    return false;
  }
}

const createTaskArgumentsSchema = z.object({ title: z.string().trim().min(1).max(200) }).strict();
const openWebsiteArgumentsSchema = z
  .object({
    url: z.string().url().max(2_048),
    label: z.string().trim().min(1).max(120),
  })
  .strict()
  .superRefine(({ url }, context) => {
    if (!isSafeNavigationUrl(url)) {
      context.addIssue({ code: "custom", message: "Unsafe website URL." });
    }
  });

export const agentPlanSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("create_task"), arguments: createTaskArgumentsSchema }).strict(),
  z.object({ tool: z.literal("open_website"), arguments: openWebsiteArgumentsSchema }).strict(),
]);

export type AgentPlan = z.infer<typeof agentPlanSchema>;
export type NavigationPlan = Extract<AgentPlan, { tool: "open_website" }>;

export type PlannedInstruction =
  | { kind: "execute"; plan: AgentPlan }
  | { kind: "needs_input"; message: string }
  | { kind: "unsupported"; message: string };

const createTaskCommand =
  /^(?:(?:please\s+)?(?:create|add)\s+(?:me\s+)?(?:a\s+)?task(?:\s*:\s*|\s+(?:to|for|called|named|titled)\s+)?|(?:i\s+)?(?:need|want)\s+(?:a\s+)?task\s+(?:to|for)\s+)(.*)$/i;
const youtubeSearchCommand =
  /^(?:please\s+)?(?:search|find)\s+(?:on\s+)?youtube\s+(?:for\s*)?(.*)$/i;
const youtubeSuffixSearchCommand = /^(?:please\s+)?(?:search|find)\s+(.+?)\s+on\s+youtube$/i;
const videoSearchCommand =
  /^(?:please\s+)?(?:find|search for)\s+(.+?)\s+(?:videos?|video clips?|courses?|tutorials?)$/i;
const videoSearchPrefixCommand =
  /^(?:please\s+)?(?:find|search for)\s+(?:videos?|video clips?)\s+(?:about|for|on)\s+(.+)$/i;
const imageSearchCommand =
  /^(?:please\s+)?(?:find|search for|show me)\s+(?:some\s+)?images?\s+(?:of|for|related to)\s+(.+)$/i;
const imageSearchSuffixCommand =
  /^(?:please\s+)?(?:find|search for)\s+(.+?)\s+(?:images?|photos?|wallpapers?)$/i;
const imageInspirationCommand =
  /^(?:please\s+)?(?:find|search for)\s+(?:some\s+)?inspiration\s+for\s+(.+)$/i;
const interfaceImageCommand = /^(?:please\s+)?show me\s+(.+?\binterfaces?)$/i;
const musicSearchCommand =
  /^(?:please\s+)?(?:find|search for)\s+(?:some\s+)?(.+?)\s+(?:music|songs?)$/i;
const artistSongSearchCommand =
  /^(?:please\s+)?(?:find|search for)\s+(?:some\s+)?songs?\s+by\s+(.+)$/i;
const webSearchCommand =
  /^(?:please\s+)?(?:search (?:the )?web(?: for)?|search for|find (?:me )?information about|look up|look for)\s+(.+)$/i;
const youtubePlayCommand = /^(?:please\s+)?play\s+(.+?)(?:\s+(?:on|in)\s+youtube)?$/i;
const openCommand = /^(?:please\s+)?(?:open|go to|take me to|launch)\s+(.+)$/i;
const explicitWebsiteCommand =
  /^(?:please\s+)?open\s+(?:this\s+website\s*:\s*|website\s+)(https?:\/\/\S+|[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?)$/i;
const knownSites: Record<string, { url: string; label: string }> = {
  youtube: { url: "https://www.youtube.com/", label: "YouTube" },
  google: { url: "https://www.google.com/", label: "Google" },
  github: { url: "https://github.com/", label: "GitHub" },
  "stack overflow": { url: "https://stackoverflow.com/", label: "Stack Overflow" },
  stackoverflow: { url: "https://stackoverflow.com/", label: "Stack Overflow" },
  bmw: { url: "https://www.bmw.com/", label: "BMW" },
  netflix: { url: "https://www.netflix.com/", label: "Netflix" },
  react: { url: "https://react.dev/", label: "React" },
};

function normalizeCommand(instruction: string): string {
  return instruction
    .trim()
    .replace(/^jarvis[,:\s]+/i, "")
    .replace(/^(?:(?:can|could|would)\s+you|please)\s+/i, "")
    .replace(/^(?:i['’]d like|i would like|i want)\s+to\s+/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

function createNavigationPlan(url: string, label: string): PlannedInstruction {
  const validated = agentPlanSchema.safeParse({ tool: "open_website", arguments: { url, label } });
  if (!validated.success) {
    return {
      kind: "needs_input",
      message: "Please provide a valid HTTP or HTTPS website address.",
    };
  }
  return { kind: "execute", plan: validated.data };
}

function resolveWebsite(destination: string): PlannedInstruction {
  const normalized = destination
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "");
  const knownSite = knownSites[normalized];
  if (knownSite) return createNavigationPlan(knownSite.url, knownSite.label);

  const hostCandidate = destination.trim();
  const withProtocol = /^https?:\/\//i.test(hostCandidate)
    ? hostCandidate
    : `https://${hostCandidate}`;
  try {
    const parsed = new URL(withProtocol);
    if (!isSafeNavigationUrl(parsed.toString())) {
      throw new Error("Invalid website URL");
    }
    return createNavigationPlan(parsed.toString(), parsed.hostname);
  } catch {
    return {
      kind: "needs_input",
      message: "Please provide a valid HTTP or HTTPS website address.",
    };
  }
}

export function planAgentInstruction(instruction: string): PlannedInstruction {
  let command = normalizeCommand(instruction);
  const taskMatch = createTaskCommand.exec(command);
  if (taskMatch) {
    const title = taskMatch[1]?.trim().replace(/^reminding me to\s+/i, "");
    if (!title) return { kind: "needs_input", message: "What should I name the task?" };
    const parsedPlan = agentPlanSchema.safeParse({ tool: "create_task", arguments: { title } });
    if (!parsedPlan.success) {
      return {
        kind: "needs_input",
        message: "Please provide a task title between 1 and 200 characters.",
      };
    }
    return { kind: "execute", plan: parsedPlan.data };
  }

  if (/^(?:please\s+)?open\s+youtube$/i.test(command)) {
    return createNavigationPlan(knownSites.youtube.url, knownSites.youtube.label);
  }

  const youtubeCombinedSearch = /^(?:please\s+)?open\s+youtube\s+and\s+search\s+for\s+(.+)$/i.exec(
    command,
  );
  if (youtubeCombinedSearch) {
    const query = youtubeCombinedSearch[1]?.trim();
    if (!query) return { kind: "needs_input", message: "What should I search for on YouTube?" };
    return createNavigationPlan(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      `YouTube search: ${query}`,
    );
  }

  const youtubeCombinedPlay = /^(?:please\s+)?open\s+youtube\s+and\s+play\s+(.+)$/i.exec(command);
  if (youtubeCombinedPlay) {
    const request = youtubeCombinedPlay[1]?.trim();
    if (!request || /^(?:a\s+)?(?:song|music)$/i.test(request)) {
      return {
        kind: "needs_input",
        message: "Which song or artist should I search for on YouTube?",
      };
    }
    return createNavigationPlan(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(request)}`,
      `YouTube search (playback not started): ${request}`,
    );
  }

  const youtubeSearch = youtubeSearchCommand.exec(command);
  if (youtubeSearch) {
    const query = youtubeSearch[1]?.trim();
    if (!query) {
      return { kind: "needs_input", message: "What would you like to search for on YouTube?" };
    }
    return createNavigationPlan(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      `YouTube search: ${query}`,
    );
  }
  const youtubeSuffixSearch = youtubeSuffixSearchCommand.exec(command);
  if (youtubeSuffixSearch) {
    const query = youtubeSuffixSearch[1]?.trim().replace(/^for\s+/i, "");
    if (!query)
      return { kind: "needs_input", message: "What would you like to search for on YouTube?" };
    return createNavigationPlan(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      `YouTube search: ${query}`,
    );
  }
  const videoSearch = videoSearchCommand.exec(command) ?? videoSearchPrefixCommand.exec(command);
  if (videoSearch) {
    const query = videoSearch[1]
      ?.trim()
      .replace(/^me\s+/i, "")
      .replace(/^(?:the|a|an|some)\s+/i, "")
      .replace(/^(?:good|great)\s+/i, "");
    if (!query) return { kind: "needs_input", message: "What kind of videos should I search for?" };
    return createNavigationPlan(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      `YouTube video search: ${query}`,
    );
  }

  const imageSearch =
    imageSearchCommand.exec(command) ??
    imageSearchSuffixCommand.exec(command) ??
    imageInspirationCommand.exec(command) ??
    interfaceImageCommand.exec(command);
  if (imageSearch) {
    const query = imageSearch[1]?.trim();
    if (!query) return { kind: "needs_input", message: "What images would you like to find?" };
    return createNavigationPlan(
      `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`,
      `Bing image search: ${query}`,
    );
  }

  const webSearch = webSearchCommand.exec(command);
  if (webSearch) {
    const query = webSearch[1]?.trim();
    if (!query)
      return { kind: "needs_input", message: "What would you like to search the web for?" };
    return createNavigationPlan(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
      `Bing web search: ${query}`,
    );
  }
  const listenRequest = /^(?:i\s+)?(?:want to\s+)?listen to\s+(.+)$/i.exec(command);
  if (listenRequest) {
    const requested = listenRequest[1]?.trim();
    if (!requested || /^(?:some\s+)?(?:music|a song|songs)$/i.test(requested)) {
      return {
        kind: "needs_input",
        message: "Which song or artist should I search for on YouTube?",
      };
    }
    command = `play ${requested}`;
  }
  const putOnRequest = /^(?:i\s+)?(?:want to\s+)?put on\s+(.+)$/i.exec(command);
  if (putOnRequest) {
    const requested = putOnRequest[1]?.trim().replace(/^(?:some|a|the)\s+/i, "");
    if (!requested || /^(?:music|a song|songs)$/i.test(requested)) {
      return {
        kind: "needs_input",
        message: "Which song or artist should I search for on YouTube?",
      };
    }
    command = `play ${requested}`;
  }
  if (
    /^(?:please\s+)?(?:play|listen to|put on)\s+(?:(?:a|some|the)\s+)?(?:song|music|songs)(?:\s+(?:on|in)\s+youtube)?$/i.test(
      command,
    )
  ) {
    return { kind: "needs_input", message: "What song or artist should I search for on YouTube?" };
  }
  const artistSongSearch = artistSongSearchCommand.exec(command);
  if (artistSongSearch) {
    const artist = artistSongSearch[1]?.trim();
    if (!artist) return { kind: "needs_input", message: "Which artist should I search for?" };
    const query = `${artist} songs`;
    return createNavigationPlan(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      `YouTube music search: ${query}`,
    );
  }
  const musicSearch = musicSearchCommand.exec(command);
  if (musicSearch) {
    const query = musicSearch[1]?.trim();
    if (!query) return { kind: "needs_input", message: "What music should I search for?" };
    return createNavigationPlan(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} music`)}`,
      `YouTube music search: ${query}`,
    );
  }
  const youtubePlay = youtubePlayCommand.exec(command);
  if (youtubePlay) {
    const songByArtist = /^(?:a\s+)?(?:song|music)\s+by\s+(.+)$/i.exec(
      youtubePlay[1]?.trim() ?? "",
    );
    if (/^(?:a\s+)?(?:song|music)\s+by\s*$/i.test(youtubePlay[1]?.trim() ?? "")) {
      return { kind: "needs_input", message: "Which artist or song should I search for?" };
    }
    const query = songByArtist ? `${songByArtist[1]?.trim()} songs` : youtubePlay[1]?.trim();
    if (!query)
      return {
        kind: "needs_input",
        message: "What song or artist should I search for on YouTube?",
      };
    return createNavigationPlan(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      `YouTube search (playback not started): ${query}`,
    );
  }

  const explicitWebsite = explicitWebsiteCommand.exec(command);
  if (explicitWebsite) return resolveWebsite(explicitWebsite[1]);
  const openMatch = openCommand.exec(command);
  if (openMatch) {
    const destination = openMatch[1]
      ?.trim()
      .replace(/^the official\s+/i, "")
      .replace(/^official\s+/i, "")
      .replace(/^a\s+/i, "")
      .replace(/\s+for me$/i, "")
      .replace(/\s+website$/i, "");
    if (!destination) return { kind: "needs_input", message: "Which website should I open?" };
    const knownName = destination.toLowerCase().replace(/^the\s+/, "");
    if (knownSites[knownName]) return resolveWebsite(knownName);
    return {
      kind: "unsupported",
      message: "Sorry, boss. I can’t open that website yet.",
    };
  }

  return {
    kind: "unsupported",
    message: "Sorry, boss. I can’t do that just yet.",
  };
}
