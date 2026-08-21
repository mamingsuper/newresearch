import { UpstreamServiceError } from '../retrieval/supabase-retriever.mjs';

export class TavilyClient {
  constructor({
    apiKey,
    projectId = null,
    fetchImpl = globalThis.fetch,
    baseUrl = 'https://api.tavily.com',
  }) {
    if (!apiKey) throw new TypeError('Tavily API key is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.apiKey = apiKey;
    this.projectId = projectId;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  headers() {
    const headers = {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (this.projectId) headers['x-project-id'] = this.projectId;
    return headers;
  }

  async request(endpoint, body, serviceName) {
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new UpstreamServiceError(serviceName, `request failed with HTTP ${response.status}`, response.status);
    }
    return response.json();
  }

  async searchConferences(
    query,
    { maxResults = 10, includeDomains = undefined, excludeDomains = undefined } = {},
  ) {
    return this.request(
      '/search',
      {
        query,
        topic: 'general',
        search_depth: 'basic',
        max_results: Math.min(Math.max(maxResults, 1), 20),
        ...(includeDomains?.length ? { include_domains: includeDomains } : {}),
        ...(excludeDomains?.length ? { exclude_domains: excludeDomains } : {}),
      },
      'Tavily search',
    );
  }

  async crawlConference(
    url,
    {
      instructions = undefined,
      selectPaths = undefined,
      selectDomains = undefined,
      excludePaths = ['/login.*', '/account.*', '/admin.*'],
      excludeDomains = undefined,
      maxDepth = 1,
      maxBreadth = 20,
      limit = 50,
    } = {},
  ) {
    return this.request(
      '/crawl',
      {
        url,
        max_depth: Math.min(Math.max(maxDepth, 1), 5),
        max_breadth: Math.min(Math.max(maxBreadth, 1), 100),
        limit: Math.min(Math.max(limit, 1), 200),
        allow_external: false,
        extract_depth: 'basic',
        format: 'markdown',
        ...(instructions ? { instructions } : {}),
        ...(selectPaths?.length ? { select_paths: selectPaths } : {}),
        ...(selectDomains?.length ? { select_domains: selectDomains } : {}),
        ...(excludePaths?.length ? { exclude_paths: excludePaths } : {}),
        ...(excludeDomains?.length ? { exclude_domains: excludeDomains } : {}),
      },
      'Tavily crawl',
    );
  }
}
