import { Config, Env } from '../decorators';

@Config
export class AiBuilderConfig {
	/** Anthropic API key for direct Anthropic access */
	@Env('N8N_AI_ANTHROPIC_KEY')
	apiKey: string = '';

	/** OpenRouter API key (alternative to Anthropic direct) */
	@Env('N8N_AI_OPENROUTER_KEY')
	openRouterKey: string = '';

	/** AI Provider: 'anthropic' (default) or 'openrouter' */
	@Env('N8N_AI_PROVIDER')
	provider: string = 'anthropic';

	/** OpenRouter model to use (default: anthropic/claude-sonnet-4-5) */
	@Env('N8N_AI_OPENROUTER_MODEL')
	openRouterModel: string = 'anthropic/claude-sonnet-4-5';
}
