export type ChatHubMessageType = 'human' | 'ai' | 'system' | 'tool' | 'generic';
export type ChatHubMessageStatus = 'success' | 'error' | 'running' | 'cancelled' | 'waiting';

/**
 * Message structure returned from Chat Hub for memory reconstruction.
 * Includes the chain tracking fields for proper history building.
 */
export interface ChatHubMemoryMessage {
	id: string;
	type: ChatHubMessageType;
	content: string;
	name: string;
	createdAt: Date;
	previousMessageId: string | null;
	retryOfMessageId: string | null;
	revisionOfMessageId: string | null;
}

/**
 * Options for adding an AI message to chat hub
 */
export interface AddAIMessageOptions {
	executionId?: number;
	model?: string;
	provider?: string;
}

/**
 * Options for adding a tool message to chat hub
 */
export interface AddToolMessageOptions {
	executionId?: number;
}

/**
 * Service interface for interacting with a specific chat hub session.
 * Provides methods to read and write messages for persistent conversation history.
 */
export interface IChatHubSessionService {
	/** Get session owner ID (the user who owns the session) */
	getOwnerId(): string;

	/** Get all messages for the session with proper history reconstruction */
	getMessages(lastMessageId?: string): Promise<ChatHubMemoryMessage[]>;

	/** Add a human message to the session */
	addHumanMessage(content: string, previousMessageId: string | null): Promise<string>;

	/** Add an AI message to the session */
	addAIMessage(
		content: string,
		previousMessageId: string | null,
		options?: AddAIMessageOptions,
	): Promise<string>;

	/** Add a tool call/result message */
	addToolMessage(
		toolCallId: string,
		toolName: string,
		toolInput: unknown,
		toolOutput: unknown,
		previousMessageId: string | null,
		options?: AddToolMessageOptions,
	): Promise<string>;

	/** Clear all messages for the session */
	clearMessages(): Promise<void>;

	/** Ensure session exists, creating it if needed */
	ensureSession(title?: string): Promise<void>;
}
