import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import type { INode, IWorkflowBase } from 'n8n-workflow';

import { test, expect } from '../../../fixtures/base';

interface SummaryResponse {
	summary: string;
	airtableId: string;
	videoId: string;
}

interface DuplicateErrorResponse {
	error: string;
	youtubeUrl: string;
	model: string;
	existingRecordId: string;
}

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

const WORKFLOW_FILE = join(
	findRepoRoot(),
	'deployment',
	'hetzner',
	'youtube-summary-workflow.json',
);

const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=unit-test-123';
const TEST_MODEL = 'openai/gpt-4o';

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

test.use({ capability: { env: { _ISOLATION: 'youtube-summary' } } });

test('YouTube Summary workflow returns summary for new video', async ({ api }) => {
	const { webhookPath } = await importYouTubeSummaryWorkflow(api, BASE_STUB_DATA);

	const response = await api.webhooks.trigger(`/webhook/${webhookPath}`, {
		method: 'POST',
		data: { youtubeUrl: TEST_VIDEO_URL, override: false },
	});

	expect(response.ok()).toBe(true);
	const responseData = await response.json();
	expect(isSummaryResponse(responseData)).toBe(true);
	if (!isSummaryResponse(responseData)) return;

	expect(responseData.summary).toBe(BASE_STUB_DATA.summary);
	expect(responseData.airtableId).toBe(BASE_STUB_DATA.airtableId);
	expect(responseData.videoId).toBe(BASE_STUB_DATA.videoId);
	assertHasAiReview(responseData.summary);
});

test('YouTube Summary workflow blocks duplicates without override', async ({ api }) => {
	const duplicateStub = {
		...BASE_STUB_DATA,
		duplicateRecords: [{ id: 'rec_existing_456' }],
	};
	const { webhookPath } = await importYouTubeSummaryWorkflow(api, duplicateStub);

	const response = await api.webhooks.trigger(`/webhook/${webhookPath}`, {
		method: 'POST',
		data: { youtubeUrl: TEST_VIDEO_URL, override: false },
	});

	expect(response.status()).toBe(409);
	const responseData = await response.json();
	expect(isDuplicateErrorResponse(responseData)).toBe(true);
	if (!isDuplicateErrorResponse(responseData)) return;

	expect(responseData.youtubeUrl).toBe(TEST_VIDEO_URL);
	expect(responseData.model).toBe(TEST_MODEL);
	expect(responseData.existingRecordId).toBe('rec_existing_456');
});

test('YouTube Summary workflow updates duplicates with override', async ({ api }) => {
	const duplicateStub = {
		...BASE_STUB_DATA,
		duplicateRecords: [{ id: 'rec_existing_456' }],
		airtableId: 'rec_updated_789',
	};
	const { webhookPath } = await importYouTubeSummaryWorkflow(api, duplicateStub);

	const response = await api.webhooks.trigger(`/webhook/${webhookPath}`, {
		method: 'POST',
		data: { youtubeUrl: TEST_VIDEO_URL, override: true },
	});

	expect(response.ok()).toBe(true);
	const responseData = await response.json();
	expect(isSummaryResponse(responseData)).toBe(true);
	if (!isSummaryResponse(responseData)) return;

	expect(responseData.summary).toBe(duplicateStub.summary);
	expect(responseData.airtableId).toBe(duplicateStub.airtableId);
	expect(responseData.videoId).toBe(duplicateStub.videoId);
	assertHasAiReview(responseData.summary);
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isSummaryResponse(value: unknown): value is SummaryResponse {
	if (!isRecord(value)) return false;
	return (
		typeof value.summary === 'string' &&
		typeof value.airtableId === 'string' &&
		typeof value.videoId === 'string'
	);
}

function isDuplicateErrorResponse(value: unknown): value is DuplicateErrorResponse {
	if (!isRecord(value)) return false;
	return (
		typeof value.error === 'string' &&
		typeof value.youtubeUrl === 'string' &&
		typeof value.model === 'string' &&
		typeof value.existingRecordId === 'string'
	);
}

function assertHasAiReview(summary: string) {
	expect(summary).toContain('AI Review');
	expect(summary).toContain('Insightful:');
	expect(summary).toContain('Unique:');
	expect(summary).toContain('AI Created:');
	expect(summary).toContain('Informative:');
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

function importYouTubeSummaryWorkflow(
	api: {
		workflows: {
			importWorkflowFromDefinition: (
				workflowDefinition: IWorkflowBase,
				options?: { webhookPrefix?: string; makeUnique?: boolean },
			) => Promise<{
				workflowId: string;
				createdWorkflow: IWorkflowBase;
				webhookPath?: string;
			}>;
			activate: (workflowId: string, versionId: string) => Promise<void>;
		};
	},
	stubData: StubData,
) {
	const fileContent = readFileSync(WORKFLOW_FILE, 'utf8');
	const workflowDefinition = parseWorkflowDefinition(fileContent);
	const stubbedWorkflow = createStubbedWorkflow(workflowDefinition, stubData);

	return api.workflows
		.importWorkflowFromDefinition(stubbedWorkflow, { webhookPrefix: 'youtube-summary' })
		.then(async ({ workflowId, createdWorkflow, webhookPath }) => {
			await api.workflows.activate(workflowId, createdWorkflow.versionId!);
			if (!webhookPath) throw new Error('Webhook path not found after import');
			return { workflowId, createdWorkflow, webhookPath };
		});
}

function createStubbedWorkflow(workflow: IWorkflowBase, stubData: StubData): IWorkflowBase {
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

function buildCodeReturn(payload: Record<string, unknown>) {
	return `return [{ json: ${JSON.stringify(payload)} }];`;
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
