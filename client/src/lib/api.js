const BASE = import.meta.env.VITE_API_BASE ?? '';

class ApiClientError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 25_000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload.ok === false) {
      const error = payload.error ?? {};
      throw new ApiClientError(
        error.message ?? `Request failed with status ${response.status}`,
        error.code ?? 'request_failed',
        error.details,
      );
    }
    return payload.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiClientError('The request took too long. Check that the API is running.', 'timeout');
    }
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Could not reach the API. Is the server running on port 4000?', 'network_error');
  } finally {
    clearTimeout(timer);
  }
}

export function postDiff({ before, after, fromVersion }) {
  return request('/api/diff', {
    method: 'POST',
    body: JSON.stringify({ before, after, ...(fromVersion ? { fromVersion } : {}) }),
  });
}

export function saveReport({ title, before, after, fromVersion }) {
  return request('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ title, before, after, ...(fromVersion ? { fromVersion } : {}) }),
  });
}

export function getReport(slug) {
  return request(`/api/reports/${encodeURIComponent(slug)}`);
}

export function listReports(limit = 6) {
  return request(`/api/reports?limit=${limit}`);
}

export { ApiClientError };
