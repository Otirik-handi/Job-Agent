export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { message?: string } | null)?.message ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error((errBody as { message?: string } | null)?.message ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error((errBody as { message?: string } | null)?.message ?? `上传失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}
