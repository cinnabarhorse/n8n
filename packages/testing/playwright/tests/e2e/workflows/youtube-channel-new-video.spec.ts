import flatted from 'flatted';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import type { INode, IWorkflowBase } from 'n8n-workflow';

import { test, expect } from '../../../fixtures/base';

interface StubData {
	transcriptText: string;
	videoTitle: string;
	channelName: string;
	views: string;
	videoId: string;
	summary: string;
	keywords: string;
	duplicateRecords: Array<{ id: string }>;
	airtableId: string;
}

const SUMMARY_WORKFLOW_FILE = join(
	findRepoRoot(),
	'deployment',
	'hetzner',
	'youtube-summary-workflow.json',
);

const CHANNEL_WORKFLOW_FILE = join(
	findRepoRoot(),
	'deployment',
	'hetzner',
	'youtube-channel-new-video-workflow.json',
);

const BASE_STUB_DATA: StubData = {
	transcriptText: 'This is a deterministic transcript for testing.',
	videoTitle: 'Deterministic Testing Video',
	channelName: 'Test Channel',
	views: '12345',
	videoId: 'video-123',
	summary: [
		'AI Review',
		'- Insightful: 7/10',
		'- Unique: 6/10',
		'- AI Created: 2/10',
		'- Informative: 8/10',
		'',
		'Deterministic summary output.',
	].join('\n'),
	keywords: 'testing, automation, workflows',
	duplicateRecords: [],
	airtableId: 'rec_test_123',
};

const FEED_ITEMS = [
	{
		link: 'https://www.youtube.com/watch?v=new-video-123',
		guid: 'yt:video:new-video-123',
		'yt:channelId': 'channel-a',
		isoDate: '2024-01-03T10:00:00.000Z',
		pubDate: 'Wed, 03 Jan 2024 10:00:00 GMT',
	},
	{
		link: 'https://www.youtube.com/watch?v=old-video-456',
		guid: 'yt:video:old-video-456',
		'yt:channelId': 'channel-a',
		isoDate: '2024-01-02T10:00:00.000Z',
		pubDate: 'Tue, 02 Jan 2024 10:00:00 GMT',
	},
	{
		link: 'https://www.youtube.com/watch?v=new-video-789',
		guid: 'yt:video:new-video-789',
		'yt:channelId': 'channel-b',
		isoDate: '2024-01-04T10:00:00.000Z',
		pubDate: 'Thu, 04 Jan 2024 10:00:00 GMT',
	},
	{
		link: 'https://www.youtube.com/watch?v=old-video-987',
		guid: 'yt:video:old-video-987',
		'yt:channelId': 'channel-b',
		isoDate: '2024-01-01T10:00:00.000Z',
		pubDate: 'Mon, 01 Jan 2024 10:00:00 GMT',
	},
];

test.use({ capability: { env: { _ISOLATION: 'youtube-channel-new-video' } } });

test('YouTube channel workflow runs summaries for newest per channel', async ({ api }) => {
	const summaryDefinition = parseWorkflowDefinition(readFileSync(SUMMARY_WORKFLOW_FILE, 'utf8'));
	const stubbedSummary = createStubbedSummaryWorkflow(summaryDefinition, BASE_STUB_DATA);
	const {
		workflowId: summaryWorkflowId,
		createdWorkflow: summaryWorkflow,
	} = await api.workflows.importWorkflowFromDefinition(stubbedSummary);
	await api.workflows.activate(summaryWorkflowId, summaryWorkflow.versionId!);

	const channelDefinition = parseWorkflowDefinition(readFileSync(CHANNEL_WORKFLOW_FILE, 'utf8'));
	const stubbedChannel = createStubbedChannelWorkflow(channelDefinition, summaryWorkflowId, FEED_ITEMS);
	stubbedChannel.active = false;

	const {
		workflowId: channelWorkflowId,
		createdWorkflow: channelWorkflow,
	} = await api.workflows.importWorkflowFromDefinition(stubbedChannel);

	await runWorkflow(api, channelWorkflowId, channelWorkflow, 'Schedule Trigger');
	const parentExecution = await api.workflows.waitForExecution(
		channelWorkflowId,
		10000,
		'manual',
	);
	expect(parentExecution.status).toBe('success');

	const parentExecutionDetails = await api.workflows.getExecution(parentExecution.id);
	const executionData = flatted.parse(parentExecutionDetails.data);
	const preparedItems = collectNodeItems(
		executionData.resultData.runData,
		'Prepare Summary Request',
	);
	expect(preparedItems).toHaveLength(2);
	expect(preparedItems.map((item) => item.youtubeUrl)).toEqual(
		expect.arrayContaining([
			'https://www.youtube.com/watch?v=new-video-123',
			'https://www.youtube.com/watch?v=new-video-789',
		]),
	);

	const firstIntegrated = await api.workflows.waitForExecution(
		summaryWorkflowId,
		10000,
		'integrated',
	);
	expect(firstIntegrated.status).toBe('success');
	const firstChildExecutions = await api.workflows.getExecutions(summaryWorkflowId);
	const firstCount = firstChildExecutions.filter((e) => e.workflowId === summaryWorkflowId).length;
	expect(firstCount).toBeGreaterThanOrEqual(2);

	await runWorkflow(api, channelWorkflowId, channelWorkflow, 'Schedule Trigger');
	await api.workflows.waitForExecution(channelWorkflowId, 10000, 'manual');

	const secondChildExecutions = await api.workflows.getExecutions(summaryWorkflowId);
	const secondCount = secondChildExecutions.filter((e) => e.workflowId === summaryWorkflowId).length;
	expect(secondCount).toBe(firstCount);
});

async function runWorkflow(
	api: { request: { post: (path: string, options: { data: unknown }) => Promise<{ ok: () => boolean }> } },
	workflowId: string,
	workflowData: IWorkflowBase,
	triggerName: string,
) {
	const runResponse = await api.request.post(`/rest/workflows/${workflowId}/run`, {
		data: {
			workflowData,
			triggerToStartFrom: { name: triggerName },
		},
	});
	expect(runResponse.ok()).toBe(true);
}

function createStubbedChannelWorkflow(
	workflow: IWorkflowBase,
	summaryWorkflowId: string,
	feedItems: Array<Record<string, string>>,
): IWorkflowBase {
	const clonedWorkflow = structuredClone(workflow);

	updateNodeByName(clonedWorkflow, 'Read YouTube Feed', (node) => {
		setCodeNode(node, buildCodeReturn(feedItems.map((item) => ({ json: item }))));
	});

	updateNodeByName(clonedWorkflow, 'Run YouTube Summary Workflow', (node) => {
		const parameters = isRecord(node.parameters) ? node.parameters : {};
		const workflowIdParam = parameters.workflowId;
		if (!isRecord(workflowIdParam)) {
			throw new Error('Run YouTube Summary Workflow missing workflowId parameter');
		}
		workflowIdParam.value = summaryWorkflowId;
		workflowIdParam.mode = 'list';
		workflowIdParam.__rl = true;
		node.parameters = parameters;
	});

	return clonedWorkflow;
}

function createStubbedSummaryWorkflow(workflow: IWorkflowBase, stubData: StubData): IWorkflowBase {
	const clonedWorkflow = structuredClone(workflow);

	updateNodeByName(clonedWorkflow, 'Webhook Trigger', (node) => {
		const parameters = isRecord(node.parameters) ? node.parameters : {};
		parameters.authentication = 'none';
		node.parameters = parameters;
		delete node.credentials;
	});

	updateNodeByName(clonedWorkflow, 'Get YouTube Transcript', (node) => {
		setCodeNode(node, buildCodeReturn({
			text: stubData.transcriptText,
			videoTitle: stubData.videoTitle,
			channelName: stubData.channelName,
			views: stubData.views,
			videoId: stubData.videoId,
		}));
	});

	updateNodeByName(clonedWorkflow, 'Check for Duplicate', (node) => {
		setCodeNode(node, buildCodeReturn({ records: stubData.duplicateRecords }));
	});

	updateNodeByName(clonedWorkflow, 'Summarize Transcript', (node) => {
		setCodeNode(node, buildCodeReturn({ output: stubData.summary }));
	});

	updateNodeByName(clonedWorkflow, 'Extract Keywords', (node) => {
		setCodeNode(node, buildCodeReturn({ output: stubData.keywords }));
	});

	updateNodeByName(clonedWorkflow, 'Update Existing Record', (node) => {
		setCodeNode(node, buildCodeReturn({ id: stubData.airtableId }));
	});

	updateNodeByName(clonedWorkflow, 'Save to Airtable', (node) => {
		setCodeNode(node, buildCodeReturn({ id: stubData.airtableId }));
	});

	removeNodeByName(clonedWorkflow, 'OpenRouter Chat Model');
	delete clonedWorkflow.connections['OpenRouter Chat Model'];

	return clonedWorkflow;
}

function updateNodeByName(
	workflow: IWorkflowBase,
	nodeName: string,
	update: (node: INode) => void,
) {
	const node = workflow.nodes.find((current) => current.name === nodeName);
	if (!node) throw new Error(`Node not found: ${nodeName}`);
	update(node);
}

function removeNodeByName(workflow: IWorkflowBase, nodeName: string) {
	workflow.nodes = workflow.nodes.filter((node) => node.name !== nodeName);
}

function setCodeNode(node: INode, jsCode: string) {
	node.type = 'n8n-nodes-base.code';
	node.typeVersion = 2;
	node.parameters = { jsCode };
	delete node.credentials;
}

function buildCodeReturn(payload: unknown) {
	const items = Array.isArray(payload) ? payload : [{ json: payload }];
	return `return ${JSON.stringify(items)};`;
}

function collectNodeItems(
	runData: Record<string, Array<{ data?: { main?: Array<Array<{ json: Record<string, string> }>> } }>>,
	nodeName: string,
) {
	const nodeRuns = runData[nodeName] ?? [];
	const items: Array<Record<string, string>> = [];
	for (const run of nodeRuns) {
		const main = run.data?.main?.[0] ?? [];
		for (const entry of main) {
			items.push(entry.json);
		}
	}
	return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseWorkflowDefinition(fileContent: string): IWorkflowBase {
	const parsed = JSON.parse(fileContent);
	if (!isWorkflowBase(parsed)) {
		throw new Error('Invalid workflow definition');
	}
	return parsed;
}

function isWorkflowBase(value: unknown): value is IWorkflowBase {
	if (!isRecord(value)) return false;
	const nodes = Reflect.get(value, 'nodes');
	const connections = Reflect.get(value, 'connections');
	return Array.isArray(nodes) && isRecord(connections);
}

function findRepoRoot(): string {
	let currentDir = __dirname;
	while (!existsSync(join(currentDir, 'pnpm-workspace.yaml'))) {
		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			throw new Error('Could not find repo root');
		}
		currentDir = parentDir;
	}
	return currentDir;
}
