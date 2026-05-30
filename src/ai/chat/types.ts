export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  tokensUsed?: number;
  createdAt: string;
  webSources?: Array<{ title: string; uri: string }>;
}

export interface ChatConversation {
  id: string;
  userId: string;
  accountId: string | null;
  title: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: unknown;
  error?: string;
}

export interface GeminiTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, GeminiToolParam>;
    required?: string[];
  };
}

export interface GeminiToolParam {
  type: string;
  description: string;
  enum?: string[];
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}
