import dgram from "node:dgram";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const INSTALLED = Symbol.for("pen.aiSuiteNetworkGuard");

function requestUrl(input: unknown): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	if (input instanceof Request) {
		return input.url;
	}
	if (input && typeof input === "object") {
		const options = input as {
			url?: unknown;
			href?: unknown;
			protocol?: unknown;
			host?: unknown;
			hostname?: unknown;
			port?: unknown;
			path?: unknown;
		};
		if (typeof options.url === "string") {
			return options.url;
		}
		if (typeof options.href === "string") {
			return options.href;
		}
		const protocol =
			typeof options.protocol === "string" ? options.protocol : "";
		const host =
			typeof options.host === "string"
				? options.host
				: typeof options.hostname === "string"
					? options.hostname
					: "";
		const port =
			host.includes(":") || options.port == null
				? ""
				: `:${String(options.port)}`;
		const path = typeof options.path === "string" ? options.path : "";
		const joined = `${protocol}//${host}${port}${path}`;
		if (joined !== "//") {
			return joined;
		}
	}
	return String(input);
}

function networkError(url: string): Error {
	return new Error(`AI suite forbids network access: ${url}`);
}

export function installAISuiteNetworkGuard(): void {
	const globalRecord = globalThis as typeof globalThis & {
		[INSTALLED]?: true;
	};
	if (globalRecord[INSTALLED]) {
		return;
	}
	globalRecord[INSTALLED] = true;

	globalThis.fetch = ((input: unknown) => {
		return Promise.reject(networkError(requestUrl(input)));
	}) as typeof fetch;

	if (typeof WebSocket === "function") {
		globalThis.WebSocket = class ForbiddenWebSocket {
			constructor(url: unknown) {
				throw networkError(requestUrl(url));
			}
		} as typeof WebSocket;
	}

	if (typeof XMLHttpRequest === "function") {
		XMLHttpRequest.prototype.open = function open(
			_method: string,
			url: string | URL,
		) {
			throw networkError(requestUrl(url));
		};
	}

	const blockNodeRequest = (...args: unknown[]) => {
		throw networkError(requestUrl(args[0]));
	};
	http.request = blockNodeRequest as typeof http.request;
	http.get = blockNodeRequest as typeof http.get;
	https.request = blockNodeRequest as typeof https.request;
	https.get = blockNodeRequest as typeof https.get;

	const blockNet = ((...args: unknown[]) => {
		throw networkError(requestUrl(args[0]));
	}) as typeof net.connect;
	net.connect = blockNet;
	net.createConnection = blockNet as typeof net.createConnection;

	http2.connect = ((authority: unknown) => {
		throw networkError(requestUrl(authority));
	}) as typeof http2.connect;

	net.Socket.prototype.connect = function connect(...args: unknown[]) {
		throw networkError(requestUrl(args[0]));
	} as typeof net.Socket.prototype.connect;

	tls.connect = ((...args: unknown[]) => {
		throw networkError(requestUrl(args[0]));
	}) as typeof tls.connect;

	dgram.createSocket = ((...args: unknown[]) => {
		throw networkError(requestUrl(args[0]));
	}) as typeof dgram.createSocket;
}

installAISuiteNetworkGuard();
