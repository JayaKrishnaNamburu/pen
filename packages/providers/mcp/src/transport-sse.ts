import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
  MCPNodeRequest,
  MCPNodeResponse,
} from "./types.js";

interface SSESession {
  server: Server;
  transport: SSEServerTransport;
}

export function createSSEHandler(
  createServer: () => Server,
  endpoint: string,
) {
  const sessions = new Map<string, SSESession>();

  return async (
    req: MCPNodeRequest,
    res: MCPNodeResponse,
    parsedBody?: unknown,
  ): Promise<void> => {
    if (req.method === "GET") {
      const server = createServer();
      const transport = new SSEServerTransport(endpoint, res);

      transport.onclose = () => {
        sessions.delete(transport.sessionId);
      };

      sessions.set(transport.sessionId, { server, transport });
      await server.connect(transport);
      return;
    }

    if (req.method === "POST") {
      const sessionId = readSessionId(req);
      if (!sessionId) {
        res.writeHead(400).end("Missing SSE sessionId");
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404).end("Unknown SSE sessionId");
        return;
      }

      await session.transport.handlePostMessage(req, res, parsedBody);
      return;
    }

    res.writeHead(405).end("Method not allowed");
  };
}

function readSessionId(req: MCPNodeRequest): string | undefined {
  const fromUrl = req.url
    ? new URL(req.url, "http://localhost").searchParams.get("sessionId")
    : null;

  if (fromUrl) {
    return fromUrl;
  }

  const header = req.headers["mcp-session-id"];
  return Array.isArray(header) ? header[0] : header;
}
