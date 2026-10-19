export interface ConversationContextMessage {
  role: "user" | "assistant";
  content: string;
}

export const MAX_CONVERSATION_CONTEXT_CHARACTERS = 24_000;

export function limitConversationHistory(
  history: ConversationContextMessage[],
  maxCharacters = MAX_CONVERSATION_CONTEXT_CHARACTERS,
): ConversationContextMessage[] {
  const recentHistory: ConversationContextMessage[] = [];
  let remainingCharacters = maxCharacters;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.content.length > remainingCharacters) break;
    recentHistory.push(message);
    remainingCharacters -= message.content.length;
  }

  return recentHistory.reverse();
}
