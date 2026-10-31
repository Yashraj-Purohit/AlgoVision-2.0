/** Minimal Supabase REST adapter. Uses the caller's JWT so RLS remains enforced. */
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class Supabase {
  constructor({ url, key, fetchImpl = fetch }) {
    this.url = url.replace(/\/$/, ''); this.key = key; this.fetch = fetchImpl;
  }
  async request(path, { token, method = 'GET', body, headers = {} } = {}) {
    let response;
    try {
      response = await this.fetch(this.url + path, {
        method, headers: { apikey:this.key, ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...headers },
        ...(body !== undefined ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(15000)
      });
    } catch { throw new ApiError(503, 'Supabase is unreachable. Your changes were not confirmed; retry after reconnecting.'); }
    const raw = await response.text(); let data;
    try { data = raw ? JSON.parse(raw) : null; } catch { throw new ApiError(502, 'Supabase returned an invalid response.'); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new ApiError(401, 'Sign-in expired or access denied. Sign in again.');
      if (data?.code === 'PGRST202' || data?.code === 'PGRST205' || data?.code === '42P01') throw new ApiError(503, 'Database schema is missing. Apply the AlgoVision Supabase migration.');
      if (data?.code === '23514') throw new ApiError(400, 'Database validation failed or catalog capacity was exceeded.');
      if (response.status === 429) throw new ApiError(429, 'Too many requests. Wait before retrying.');
      // Never relay upstream details, SQL, credentials or response bodies to the browser.
      throw new ApiError(response.status >= 500 ? 503 : 400, path.startsWith('/auth/') ? 'Authentication failed. Check your details and confirm your email if required.' : 'Supabase could not complete this operation. Check the migration and your access.');
    }
    return data;
  }
  async listProducts(token) {
    const records = [];
    // Supabase defaults to a row cap; explicit pagination prevents truncation above 1,000.
    for (let offset = 0; offset <= 10000; offset += 500) {
      const page = await this.request(`/rest/v1/av_products?select=id,name,category,price,stock,priority&order=id.asc&offset=${offset}&limit=500`,{token});
      if (!Array.isArray(page)) throw new ApiError(502,'Invalid catalog response.');
      records.push(...page);
      if (records.length > 10000) throw new ApiError(409,'Cloud catalog exceeds the supported size.');
      if (page.length < 500) return records;
    }
    return records;
  }
}
