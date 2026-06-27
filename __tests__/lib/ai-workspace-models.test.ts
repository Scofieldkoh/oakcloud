import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/connector.service', () => ({
  getAvailableConnectors: vi.fn(),
}));

describe('workspace AI model selection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prefers enabled connector models when a provider has an editable model list', async () => {
    const { getAvailableConnectors } = await import('@/services/connector.service');
    const { getBestAvailableModelForWorkspace } = await import('@/lib/ai');

    vi.mocked(getAvailableConnectors).mockResolvedValue([
      {
        source: 'system',
        connector: {
          id: 'openrouter-connector',
          provider: 'OPENROUTER',
          settings: {
            models: [
              {
                modelId: 'openai/gpt-5.4-mini',
                name: 'GPT 5.4 Mini',
                providerModelId: 'openai/gpt-5.4-mini',
                isEnabled: true,
              },
            ],
          },
        },
      },
    ] as never);

    await expect(getBestAvailableModelForWorkspace('workspace-1')).resolves.toBe(
      'openai/gpt-5.4-mini'
    );
  });
});
