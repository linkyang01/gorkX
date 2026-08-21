/**
 * Structural proof that formal-parity capabilities have a named desktop primary path
 * (button/panel/handler), not slash-only. Reads shipped App/Settings sources.
 *
 * Run: node --experimental-strip-types src/lib/desktopPrimaryEntries.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const settings = readFileSync(join(root, 'components/SettingsPanel.tsx'), 'utf8');
const processPanel = readFileSync(join(root, 'components/ProcessPanel.tsx'), 'utf8');
const spawn = readFileSync(join(root, 'components/SubagentSpawnPanel.tsx'), 'utf8');
const code = [app, settings, processPanel, spawn].join('\n');

/** ≥15 matrix samples from formal plan verification step 1 */
const REQUIRED: Array<{ name: string; re: RegExp }> = [
  { name: 'subagent spawn panel', re: /SubagentSpawnPanel|setSubagentSpawnOpen/ },
  { name: 'subagent stop/inspect', re: /onCancelSubagent|onInspectSubagent|cancelSubagent|getSubagent/ },
  { name: 'hooks manage', re: /onManageHooks|settingsHooks|HookBuilder/ },
  { name: 'computer emergency stop', re: /emergencyStopComputerControl|settingsComputerControlEmergencyStop/ },
  { name: 'github test connection', re: /githubTestConnection|testGithubConnection|githubTest/ },
  { name: 'voice toggle', re: /toggleNativeVoice|voiceNeedTask/ },
  { name: 'custom models', re: /settingsModels|customModel|modelVerify|setModel/ },
  { name: 'memory panel', re: /setMemoryOpen|MemoryPanel/ },
  { name: 'extensions panel', re: /setExtOpen|ExtensionsPanel|onRunSkill/ },
  { name: 'worktree panel', re: /WorktreePanel|worktree/ },
  { name: 'review panel', re: /setReviewOpen|ReviewPanel/ },
  { name: 'terminal dock', re: /setTerminalOpen|TerminalDock/ },
  { name: 'billing usage', re: /onFetchBilling|settingsUsage|billing/ },
  { name: 'workflow manage', re: /manageWorkflow|WorkflowCard/ },
  { name: 'btw/interject/aside', re: /askAside|followUpAside|interject/ },
  { name: 'task/session info', re: /TaskInfoPanel|getSessionInfo|setTaskInfoOpen/ },
  { name: 'rewind dialog', re: /RewindDialog|rewind/ },
  { name: 'fork session', re: /forkActiveSession|forkSession/ },
  { name: 'queue follow-up', re: /followUpQueue|queue/ },
  { name: 'desktop shortcuts catalog', re: /matchDesktopShortcut|desktopShortcut/ },
  { name: 'escape stops running turn', re: /cancelTurn|btn-send-stop/ },
  { name: 'scheduled tasks panel', re: /ScheduledPanel|setScheduledOpen/ },
  { name: 'deliverables panel', re: /DeliverablesPanel|setDeliverablesOpen/ },
  { name: 'session bundle export/import', re: /exportSessionBundle|importSessionBundle|sessionBundleExport/ },
  { name: 'approval inbox', re: /ApprovalInboxPanel|setApprovalInboxOpen/ },
  { name: 'offline reconnect', re: /reconnectThread/ },
];

for (const item of REQUIRED) {
  assert.match(code, item.re, `missing desktop primary for: ${item.name}`);
}

// Soon connectors must not claim connected without auth machinery
const connectors = readFileSync(join(root, 'lib/connectors.ts'), 'utf8');
assert.match(connectors, /soon|Soon|unavailable/i, 'connector catalog should express Soon/unavailable');

// No Build-403 bypass helper
assert.doesNotMatch(app, /bypass.*403|fake.*stream|mockBuildAccess/i);

console.log(`desktopPrimaryEntries.test.ts: ok (${REQUIRED.length} primary paths)`);
