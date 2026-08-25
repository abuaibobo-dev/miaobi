import { getSettings } from './storage';

const BACKEND_URL_KEY = 'miaobi.backendUrl';

export async function getBackendUrl(): Promise<string | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return await AsyncStorage.getItem(BACKEND_URL_KEY);
  } catch { return null; }
}

export async function setBackendUrl(url: string): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(BACKEND_URL_KEY, url.replace(/\/+$/, ''));
}

export interface BackendResponse {
  content: string;
  provider: string;
  intent: string;
  image_url?: string;
}

export async function callBackend(
  messages: { role: string; content: string }[],
  intent?: string,
): Promise<BackendResponse> {
  const url = await getBackendUrl();
  if (!url) throw new Error('NO_BACKEND');
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, intent }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `后端请求失败（${res.status}）`);
  }
  return res.json();
}
