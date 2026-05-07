import { Platform } from 'react-native';

// Centralized API base URL.
// EXPO_PUBLIC_API_BASE overrides the automatic platform fallback.
// Fallbacks: Android emulator → 10.0.2.2, iOS simulator/web → 127.0.0.1.
const envApiBase = (process.env.EXPO_PUBLIC_API_BASE ?? '').trim();
const envSharedBackendHost = (process.env.EXPO_PUBLIC_SHARED_BACKEND_HOST ?? '').trim();

function isPrivateHost(hostname: string): boolean {
	return hostname === 'localhost'
		|| hostname === '127.0.0.1'
		|| hostname === '10.0.2.2'
		|| hostname.startsWith('192.168.')
		|| /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function rewriteLegacyBackendHost(rawUrl: string): string {
	if (!rawUrl || !envSharedBackendHost) {
		return rawUrl;
	}

	try {
		const parsed = new URL(rawUrl);
		const hostMatches = parsed.hostname === envSharedBackendHost;
		const missingPort = !parsed.port;

		if (hostMatches && missingPort && isPrivateHost(parsed.hostname)) {
			parsed.port = '8000';
		}

		if (parsed.hostname !== envSharedBackendHost && isPrivateHost(parsed.hostname)) {
			parsed.hostname = envSharedBackendHost;
			if (!parsed.port) {
				parsed.port = '8000';
			}
		}

		if (isPrivateHost(parsed.hostname) && !parsed.port) {
			parsed.port = '8000';
		}

		return parsed.toString().replace(/\/$/, '');
	} catch {
		return rawUrl;
	}
}

const platformFallback =
	envSharedBackendHost
		? `http://${envSharedBackendHost}:8000/api`
		: Platform.OS === 'android'
			? 'http://10.0.2.2:8000/api'
			: 'http://127.0.0.1:8000/api';

const normalizedApiBase = rewriteLegacyBackendHost(envApiBase || platformFallback);
export const LARAVEL_API_BASE = normalizedApiBase;
export const CHAT_API_BASE = normalizedApiBase;

const apiUrl = (() => {
	try {
		return new URL(normalizedApiBase);
	} catch {
		return null;
	}
})();

const expectedApiHost = (process.env.EXPO_PUBLIC_SHARED_BACKEND_HOST ?? '').trim();
if (expectedApiHost && apiUrl?.hostname && apiUrl.hostname !== expectedApiHost) {
	const message = `[Config] EXPO_PUBLIC_API_BASE host (${apiUrl.hostname}) does not match EXPO_PUBLIC_SHARED_BACKEND_HOST (${expectedApiHost}).`;
	if (__DEV__) {
		throw new Error(message);
	}
	console.error(message);
}

const defaultScheme = apiUrl?.protocol === 'https:' ? 'https' : 'http';

// Reverb websocket configuration (for laravel-echo/pusher-js in React Native).
export const REVERB_APP_KEY = (process.env.EXPO_PUBLIC_REVERB_APP_KEY ?? '').trim();
export const REVERB_HOST = (process.env.EXPO_PUBLIC_REVERB_HOST ?? '').trim() || apiUrl?.hostname || '';
export const REVERB_SCHEME = ((process.env.EXPO_PUBLIC_REVERB_SCHEME ?? defaultScheme).trim() || defaultScheme).toLowerCase();
export const REVERB_PORT = Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? (REVERB_SCHEME === 'https' ? 443 : 8080));

/**
 * Rewrites a Laravel storage URL so it uses the same host/port as LARAVEL_API_BASE.
 * The backend may return URLs based on APP_URL=http://localhost:8000,
 * which is unreachable from a device — needs 10.0.2.2 or the LAN IP instead.
 */
export function resolveStorageUrl(url: string): string {
	if (!url || !apiUrl) return url;
	try {
		if (url.startsWith('/')) {
			return new URL(url, `${apiUrl.origin}/`).toString();
		}

		const parsed = new URL(url);
		if (parsed.hostname !== apiUrl.hostname && isPrivateHost(parsed.hostname)) {
			parsed.protocol = apiUrl.protocol;
			parsed.hostname = apiUrl.hostname;
			parsed.port = apiUrl.port;
		}
		return parsed.toString();
	} catch {
		return url;
	}
}
