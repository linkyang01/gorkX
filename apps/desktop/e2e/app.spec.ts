import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (...args: unknown[]) => void>();
    let callbackId = 0;
    const invoke = async (command: string): Promise<unknown> => {
      switch (command) {
        case 'grok_status':
          return {
            installed: true,
            version: 'fixture',
            authenticated: true,
            authPath: '/tmp/gorkx-fixture/auth.json',
            grokPath: '/tmp/gorkx-fixture/grok',
            detail: 'Playwright fixture',
            channel: 'source',
            sourceRepoHint: 'fixture',
            upgradeOfficial: '',
            upgradeSource: '',
            docsUrl: 'https://docs.x.ai/build/overview',
            sourceUrl: 'https://github.com/xai-org/grok-build',
          };
        case 'account_summary':
          return {
            authenticated: true,
            email: 'fixture@example.invalid',
            displayName: 'Playwright Fixture',
            quotaNote: 'fixture',
          };
        case 'store_list_threads':
        case 'store_load_chat':
          return [];
        case 'store_kv_get':
          return null;
        case 'models_list_custom':
          return { grokHome: '/tmp/gorkx-fixture', configPath: '', customModels: [], defaultModel: null, note: '' };
        case 'model_context_info':
          return { modelId: 'fixture-model', name: 'Fixture model', contextWindow: 128_000, autoCompactPercent: 80 };
        case 'extensions_snapshot':
          return { skills: [], mcp: [], plugins: [], skillRoots: [], configPath: '', error: null };
        case 'app_update_check':
          return { currentVersion: '1.3.1', latestVersion: '1.3.1', updateAvailable: false, htmlUrl: null };
        case 'plugin:event|listen':
          return callbackId++;
        default:
          return null;
      }
    };

    const internals = {
      invoke,
      transformCallback: (callback: (...args: unknown[]) => void) => {
        const id = callbackId++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      runCallback: (id: number, args: unknown[]) => callbacks.get(id)?.(...args),
      convertFileSrc: (path: string) => `asset://${encodeURIComponent(path)}`,
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
    };
    (window as unknown as { __TAURI_INTERNALS__: typeof internals }).__TAURI_INTERNALS__ = internals;
    (window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => void } })
      .__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    localStorage.setItem('gorkx.project', '/tmp/gorkx-playwright-project');
    localStorage.setItem('gorkx.onboard.v1', '1');
  });
});

test('home composer exposes keyboard and capability controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.shell')).toBeVisible();

  const composer = page.locator('.composer-home-bar ~ .composer textarea');
  await expect(composer).toBeVisible();
  await composer.fill('/');
  await expect(page.getByRole('listbox')).toBeVisible();
  await composer.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();

  await page.locator('.composer-home-bar ~ .composer .plus-wrap > button').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
});
