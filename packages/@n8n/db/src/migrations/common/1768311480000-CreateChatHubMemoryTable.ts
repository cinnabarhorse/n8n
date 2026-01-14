import type { MigrationContext, ReversibleMigration } from '../migration-types';

const table = {
	memory: 'chat_hub_memory',
	sessions: 'chat_hub_sessions',
	messages: 'chat_hub_messages',
} as const;

/**
 * Creates the chat_hub_memory table for storing agent memory entries
 * separately from chat UI messages. This allows:
 * - Multiple memory nodes in the same workflow to have isolated memory
 * - Separation between what the agent remembers vs what the user sees
 * - Memory branching on edit/retry
 */
export class CreateChatHubMemoryTable1768311480000 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, column, createIndex } }: MigrationContext) {
		await createTable(table.memory)
			.withColumns(
				column('id').uuid.primary.notNull,
				column('sessionId').uuid.notNull,
				column('memoryNodeId').varchar(36).notNull.comment('n8n node ID of the MemoryChatHub node'),
				column('parentMessageId').uuid.comment(
					'ID of the 	message that triggered this memory entry',
				),
				column('role').varchar(16).notNull.comment('Role: "human", "ai", "system", "tool"'),
				column('content').text.notNull,
				column('name').varchar(128).comment('Actor name, tool name for tool messages'),
			)
			.withForeignKey('sessionId', {
				tableName: table.sessions,
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('parentMessageId', {
				tableName: table.messages,
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withTimestamps;

		await createIndex('chat_hub_memory', ['sessionId', 'memoryNodeId', 'parentMessageId']);
	}

	async down({ schemaBuilder: { dropTable, dropIndex } }: MigrationContext) {
		await dropIndex('chat_hub_memory', ['sessionId', 'memoryNodeId', 'parentMessageId']);
		await dropTable(table.memory);
	}
}
