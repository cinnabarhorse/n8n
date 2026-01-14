import { WithTimestamps } from '@n8n/db';
import {
	Column,
	Entity,
	ManyToOne,
	JoinColumn,
	type Relation,
	PrimaryGeneratedColumn,
} from '@n8n/typeorm';

import type { ChatHubMessage } from './chat-hub-message.entity';
import type { ChatHubSession } from './chat-hub-session.entity';

export type ChatHubMemoryRole = 'human' | 'ai' | 'system' | 'tool';

/**
 * Stores agent memory entries separately from chat UI messages.
 * This allows:
 * - Multiple memory nodes in the same workflow to have isolated memory
 * - Memory branching on edit/retry via parentMessageId
 * - Separation between what the agent remembers vs what the user sees
 */
@Entity({ name: 'chat_hub_memory' })
export class ChatHubMemory extends WithTimestamps {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	/**
	 * ID of the chat session this memory belongs to.
	 */
	@Column({ type: String })
	sessionId: string;

	/**
	 * The chat session this memory belongs to.
	 */
	@ManyToOne('ChatHubSession', { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'sessionId' })
	session?: Relation<ChatHubSession>;

	/**
	 * The n8n node ID of the MemoryChatHub node that owns this memory.
	 * Each memory node on the canvas has its own isolated memory space.
	 */
	@Column({ type: 'varchar', length: 36 })
	memoryNodeId: string;

	/**
	 * ID of the human message in chat_hub_messages that triggered the execution
	 * which created this memory entry. Used for branching on edit/retry.
	 * NULL for manual executions (not supported yet).
	 */
	@Column({ type: String, nullable: true })
	parentMessageId: string | null;

	/**
	 * The parent message that triggered this memory entry.
	 */
	@ManyToOne('ChatHubMessage', { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'parentMessageId' })
	parentMessage?: Relation<ChatHubMessage> | null;

	/**
	 * Role of the message: 'human', 'ai', 'system', or 'tool'.
	 */
	@Column({ type: 'varchar', length: 16 })
	role: ChatHubMemoryRole;

	/**
	 * The content of the memory entry.
	 * For tool messages, this is JSON with tool call details.
	 */
	@Column('text')
	content: string;

	/**
	 * Name of the actor (for tool messages, this is the tool name).
	 */
	@Column({ type: 'varchar', length: 128, nullable: true })
	name: string | null;
}
