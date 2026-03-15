import { env } from './env';

interface FunctionResponse<T> {
  ok: boolean;
  errorCode?: string;
  message?: string;
  data?: T;
}

export const callBackend = async <T>(
  token: string,
  action: string,
  payload: Record<string, unknown>,
) => {
  const response = await fetch(env.functionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, payload }),
  });

  const raw = await response.text();
  let data: FunctionResponse<T> | null = null;

  try {
    data = raw ? (JSON.parse(raw) as FunctionResponse<T>) : null;
  } catch {
    data = null;
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message ?? data?.errorCode ?? (raw || `Request failed with status ${response.status}`));
  }

  return data.data as T;
};
