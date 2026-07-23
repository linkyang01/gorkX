/** App-owned GitHub connector. Tokens never enter WebView storage. */
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

export interface GithubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  detailsUrl: string;
}

export interface GithubComment {
  kind: string;
  author: string;
  body: string;
  path: string | null;
  line: number | null;
  url: string;
  createdAt: string;
}

export interface GithubCreatedPullRequest {
  number: number;
  title: string;
  url: string;
  head: string;
  base: string;
  draft: boolean;
}

export interface GithubCreatePullRequestInput {
  cwd: string;
  title: string;
  body: string;
  base: string;
  draft: boolean;
}

export const githubStatus = () => invoke<GithubStatus>('github_status');
export const githubConnectReadonly = (token: string) =>
  invoke<GithubStatus>('github_connect_readonly', { token });
export const githubTestConnection = () => invoke<GithubStatus>('github_test_connection');
export const githubDisconnect = () => invoke<GithubStatus>('github_disconnect');
export const githubListOpenPrs = (cwd: string) =>
  invoke<GithubPullRequest[]>('github_list_open_prs', { cwd });
export const githubListPrChecks = (cwd: string, prNumber: number) =>
  invoke<GithubCheckRun[]>('github_list_pr_checks', { cwd, prNumber });
export const githubListPrComments = (cwd: string, prNumber: number) =>
  invoke<GithubComment[]>('github_list_pr_comments', { cwd, prNumber });
export const githubCreatePullRequest = (input: GithubCreatePullRequestInput) =>
  invoke<GithubCreatedPullRequest>('github_create_pull_request', { input });
