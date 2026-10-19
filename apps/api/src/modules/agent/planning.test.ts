import { describe, expect, it } from "vitest";
import { agentPlanSchema, planAgentInstruction } from "./planning.js";

describe("Agent Mode deterministic planning", () => {
  it.each([
    ["Create task: Review the React hooks guide", "Review the React hooks guide"],
    ["JARVIS, add a task to buy groceries.", "buy groceries"],
    ["please create a task called Call the dentist", "Call the dentist"],
    ["Create a task reminding me to revise React hooks", "revise React hooks"],
    ["I need a task to revise DBMS", "revise DBMS"],
  ])("plans the supported task command %s", (instruction, title) => {
    expect(planAgentInstruction(instruction)).toEqual({
      kind: "execute",
      plan: { tool: "create_task", arguments: { title } },
    });
  });

  it("opens Stack Overflow from its recognized shortcut", () => {
    expect(planAgentInstruction("Take me to Stack Overflow")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: { url: "https://stackoverflow.com/", label: "Stack Overflow" },
      },
    });
  });

  it("asks for a title when a task command is incomplete", () => {
    expect(planAgentInstruction("Create a task")).toMatchObject({ kind: "needs_input" });
  });

  it.each([
    ["Open YouTube", "https://www.youtube.com/"],
    ["Open YouTube for me", "https://www.youtube.com/"],
    ["Open Google", "https://www.google.com/"],
    ["Open the official BMW website", "https://www.bmw.com/"],
    ["Open Netflix", "https://www.netflix.com/"],
    ["Open the official React website", "https://react.dev/"],
    ["Open this website: example.com", "https://example.com/"],
    ["Open the official React website", "https://react.dev/"],
    ["Open official React website", "https://react.dev/"],
  ])("plans safe website navigation for %s", (instruction, url) => {
    expect(planAgentInstruction(instruction)).toMatchObject({
      kind: "execute",
      plan: { tool: "open_website", arguments: { url } },
    });
  });

  it("encodes YouTube searches and asks when search or playback details are missing", () => {
    expect(planAgentInstruction("Search YouTube for relaxing music & jazz")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=relaxing%20music%20%26%20jazz",
        },
      },
    });
    expect(planAgentInstruction("Find relaxing music on YouTube")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=relaxing%20music",
        },
      },
    });
    expect(planAgentInstruction("Find motivational videos")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=motivational",
        },
      },
    });
    expect(planAgentInstruction("Search YouTube for")).toMatchObject({ kind: "needs_input" });
    expect(planAgentInstruction("Play a song on YouTube")).toMatchObject({ kind: "needs_input" });
    expect(planAgentInstruction("Play a song in YouTube")).toMatchObject({ kind: "needs_input" });
    expect(planAgentInstruction("Play a song by")).toMatchObject({ kind: "needs_input" });
    expect(planAgentInstruction("Play Believer by Imagine Dragons")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=Believer%20by%20Imagine%20Dragons",
          label: "YouTube search (playback not started): Believer by Imagine Dragons",
        },
      },
    });
    expect(planAgentInstruction("Play Kalyani in YouTube")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=Kalyani",
        },
      },
    });
    expect(planAgentInstruction("Play a song by Arijit Singh")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=Arijit%20Singh%20songs",
        },
      },
    });
    expect(planAgentInstruction("Find relaxing music")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=relaxing%20music",
        },
      },
    });
    expect(planAgentInstruction("Find some songs by Imagine Dragons")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=Imagine%20Dragons%20songs",
        },
      },
    });
    expect(planAgentInstruction("Find videos about AI agents")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=AI%20agents",
        },
      },
    });
    expect(planAgentInstruction("Find the best beginner React courses")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=best%20beginner%20React",
        },
      },
    });
    expect(
      planAgentInstruction("Open YouTube and search for Java interview preparation"),
    ).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=Java%20interview%20preparation",
        },
      },
    });
    expect(planAgentInstruction("I'd like to listen to Believer by Imagine Dragons")).toMatchObject(
      {
        kind: "execute",
        plan: {
          tool: "open_website",
          arguments: {
            url: "https://www.youtube.com/results?search_query=Believer%20by%20Imagine%20Dragons",
          },
        },
      },
    );
    expect(planAgentInstruction("Can you put on some motivational songs?")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=motivational%20songs",
        },
      },
    });
    expect(planAgentInstruction("Search for beginner React tutorials on YouTube")).toMatchObject({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=beginner%20React%20tutorials",
        },
      },
    });
    expect(planAgentInstruction("Can you put on some music?")).toMatchObject({
      kind: "needs_input",
      message: "Which song or artist should I search for on YouTube?",
    });
  });

  it.each([
    [
      "Can you search for some images related to the BMW?",
      "https://www.bing.com/images/search?q=the%20BMW",
    ],
    ["Find BMW M4 wallpapers", "https://www.bing.com/images/search?q=BMW%20M4"],
    [
      "Find inspiration for a portfolio website",
      "https://www.bing.com/images/search?q=a%20portfolio%20website",
    ],
    [
      "Show me futuristic AI interfaces",
      "https://www.bing.com/images/search?q=futuristic%20AI%20interfaces",
    ],
    ["Search the web for React 19 features", "https://www.bing.com/search?q=React%2019%20features"],
    [
      "Look for the best Python courses",
      "https://www.bing.com/search?q=the%20best%20Python%20courses",
    ],
    ["Find information about Docker", "https://www.bing.com/search?q=Docker"],
    ["Find me a good React tutorial", "https://www.youtube.com/results?search_query=React"],
  ])("provides an honest search-page fallback for %s", (instruction, url) => {
    expect(planAgentInstruction(instruction)).toMatchObject({
      kind: "execute",
      plan: { tool: "open_website", arguments: { url } },
    });
  });

  it.each([
    "Open this website: javascript:alert(1)",
    "Open this website: https://user:pass@example.com",
    "Open this website: https://",
    "Open 127.0.0.1",
    "Open this website: laptop.local",
  ])("does not plan unsafe website navigation for %s", (instruction) => {
    expect(planAgentInstruction(instruction)).not.toMatchObject({
      kind: "execute",
      plan: { tool: "open_website" },
    });
  });

  it.each(["Research five React courses", "Send a message to my friend on WhatsApp"])(
    "responds briefly to unsupported actions without claiming execution: %s",
    (instruction) => {
      expect(planAgentInstruction(instruction)).toEqual({
        kind: "unsupported",
        message: "Sorry, boss. I can’t do that just yet.",
      });
    },
  );

  it("rejects unknown tools, extra arguments, and excessive titles", () => {
    expect(
      agentPlanSchema.safeParse({ tool: "run_shell", arguments: { command: "whoami" } }).success,
    ).toBe(false);
    expect(
      agentPlanSchema.safeParse({
        tool: "create_task",
        arguments: { title: "A".repeat(201), priority: "high" },
      }).success,
    ).toBe(false);
  });
});
