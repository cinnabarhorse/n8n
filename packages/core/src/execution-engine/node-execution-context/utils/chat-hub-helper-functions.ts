import type {
	ChatHubProxyFunctions,
	INode,
	Workflow,
	IWorkflowExecuteAdditionalData,
} from 'n8n-workflow';

export function getChatHubHelperFunctions(
	additionalData: IWorkflowExecuteAdditionalData,
	workflow: Workflow,
	node: INode,
): Partial<ChatHubProxyFunctions> {
	const chatHubProxyProvider = additionalData['chat-hub']?.chatHubProxyProvider;
	if (!chatHubProxyProvider) return {};
	return {
		getChatHubProxy: async (
			sessionId: string,
			memoryNodeId: string,
			parentMessageId: string | null,
		) =>
			await chatHubProxyProvider.getChatHubProxy(
				workflow,
				node,
				sessionId,
				memoryNodeId,
				parentMessageId,
				additionalData.userId,
			),
	};
}
