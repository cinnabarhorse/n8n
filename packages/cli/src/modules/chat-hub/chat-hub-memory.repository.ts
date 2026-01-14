import { Service } from '@n8n/di';
import { DataSource, EntityManager, In, Repository } from '@n8n/typeorm';
import type { QueryDeepPartialEntity } from '@n8n/typeorm/query-builder/QueryPartialEntity';
import { UnexpectedError } from 'n8n-workflow';

import { ChatHubMemory, type ChatHubMemoryRole } from './chat-hub-memory.entity';

export interface CreateMemoryEntryData {
	id: string;
	sessionId: string;
	memoryNodeId: string;
	parentMessageId: string | null;
	role: ChatHubMemoryRole;
	content: string;
	name: string | null;
}

@Service()
export class ChatHubMemoryRepository extends Repository<ChatHubMemory> {
	constructor(dataSource: DataSource) {
		super(ChatHubMemory, dataSource.manager);
	}

	async createMemoryEntry(entry: CreateMemoryEntryData, trx?: EntityManager) {
		const em = trx ?? this.manager;

		if (!entry.id) {
			throw new UnexpectedError('Memory entry ID is required');
		}

		if (!entry.sessionId) {
			throw new UnexpectedError('Session ID is required');
		}

		if (!entry.memoryNodeId) {
			throw new UnexpectedError('Memory node ID is required');
		}

		await em.insert(ChatHubMemory, entry as QueryDeepPartialEntity<ChatHubMemory>);
		return entry.id;
	}

	/**
	 * Get memory entries for a specific memory node,
	 * filtered by parent message IDs (for branching support).
	 */
	async getMemoryByParentMessageIds(
		sessionId: string,
		memoryNodeId: string,
		parentMessageIds: string[],
		trx?: EntityManager,
	): Promise<ChatHubMemory[]> {
		const em = trx ?? this.manager;

		if (parentMessageIds.length === 0) {
			return [];
		}

		return await em.find(ChatHubMemory, {
			where: {
				sessionId,
				memoryNodeId,
				parentMessageId: In(parentMessageIds),
			},
			order: { createdAt: 'ASC' },
		});
	}

	/**
	 * Get all memory entries for a session and memory node.
	 * Used when parentMessageId is not available (e.g., manual executions).
	 */
	async getAllMemoryForNode(
		sessionId: string,
		memoryNodeId: string,
		trx?: EntityManager,
	): Promise<ChatHubMemory[]> {
		const em = trx ?? this.manager;

		return await em.find(ChatHubMemory, {
			where: {
				sessionId,
				memoryNodeId,
			},
			order: { createdAt: 'ASC' },
		});
	}

	/**
	 * Delete all memory entries for a session and memory node.
	 */
	async deleteBySessionAndNode(
		sessionId: string,
		memoryNodeId: string,
		trx?: EntityManager,
	): Promise<void> {
		const em = trx ?? this.manager;
		await em.delete(ChatHubMemory, { sessionId, memoryNodeId });
	}

	/**
	 * Delete all memory entries for a session.
	 */
	async deleteBySessionId(sessionId: string, trx?: EntityManager): Promise<void> {
		const em = trx ?? this.manager;
		await em.delete(ChatHubMemory, { sessionId });
	}
}
