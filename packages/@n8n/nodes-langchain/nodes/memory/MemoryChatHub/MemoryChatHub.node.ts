import { BufferWindowMemory } from '@langchain/classic/memory';
import {
	NodeConnectionTypes,
	NodeOperationError,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

import { getSessionId } from '@utils/helpers';
import { logWrapper } from '@utils/logWrapper';
import { getConnectionHintNoticeField } from '@utils/sharedFields';

import {
	sessionIdOption,
	sessionKeyProperty,
	contextWindowLengthProperty,
	expressionSessionKeyProperty,
} from '../descriptions';

import { ChatHubMessageHistory } from './ChatHubMessageHistory';

export class MemoryChatHub implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Chat Hub Memory',
		name: 'memoryChatHub',
		icon: 'fa:comments',
		iconColor: 'blue',
		group: ['transform'],
		version: 1,
		description: 'Stores chat history in n8n Chat Hub for persistent conversations',
		defaults: {
			name: 'Chat Hub Memory',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Memory'],
				Memory: ['For beginners'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorychathub/',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiMemory],
		outputNames: ['Memory'],
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiAgent]),
			{
				displayName:
					'This memory stores conversations in n8n Chat Hub, enabling persistent chat history visible in the Chat interface. Tool calls are stored as separate messages for proper agent behavior.',
				name: 'chatHubNotice',
				type: 'notice',
				default: '',
			},
			sessionIdOption,
			expressionSessionKeyProperty(1),
			sessionKeyProperty,
			contextWindowLengthProperty,
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				default: {},
				placeholder: 'Add Option',
				options: [
					{
						displayName: 'Auto-Create Session',
						name: 'autoCreateSession',
						type: 'boolean',
						default: true,
						description: 'Whether to automatically create a Chat Hub session if one does not exist',
					},
					{
						displayName: 'Session Title',
						name: 'sessionTitle',
						type: 'string',
						default: 'Workflow Chat',
						description: 'Title for auto-created sessions',
						displayOptions: {
							show: {
								autoCreateSession: [true],
							},
						},
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const sessionId = getSessionId(this, itemIndex);
		const contextWindowLength = this.getNodeParameter('contextWindowLength', itemIndex) as number;
		const options = this.getNodeParameter('options', itemIndex, {}) as {
			autoCreateSession?: boolean;
			sessionTitle?: string;
		};

		// Get the Chat Hub proxy
		const proxy = await this.helpers.getChatHubProxy?.(sessionId);

		if (!proxy) {
			throw new NodeOperationError(
				this.getNode(),
				'Chat Hub module is not available. Ensure the chat-hub module is enabled.',
			);
		}

		// Auto-create session if needed
		if (options.autoCreateSession !== false) {
			await proxy.ensureSession(options.sessionTitle);
		}

		// Get execution ID for linking messages to executions
		const executionId = this.getExecutionId();

		const chatHistory = new ChatHubMessageHistory({
			proxy,
			executionId: executionId ? parseInt(executionId, 10) : undefined,
		});

		const memory = new BufferWindowMemory({
			k: contextWindowLength,
			memoryKey: 'chat_history',
			chatHistory,
			returnMessages: true,
			inputKey: 'input',
			outputKey: 'output',
		});

		return {
			response: logWrapper(memory, this),
		};
	}
}
