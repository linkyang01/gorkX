/** App-owned, read-only GitHub connector. Tokens never enter WebView storage. */
import { invoke } from '@tauri-apps/api/core';

export interface GithubStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
  error: string | null;
  note: string;
}

export interface GithubPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  updatedAt: string;
  draft: boolean;
}

export const githubStatus = () => invoke<GithubStatus>('github_status');
export const githubConnectReadonly = (token: string) =>
  invoke<GithubStatus>('github_connect_readonly', { token });
export const githubTestConnection = () => invoke<GithubStatus>('github_test_connection');
export const githubDisconnect = () => invoke<GithubStatus>('github_disconnect');
export const githubListOpenPrs = (cwd: string) =>
  invoke<GithubPullRequest[]>('github_list_open_prs', { cwd });
