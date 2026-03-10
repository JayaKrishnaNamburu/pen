import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
  MCPNodeRequest,
  MCPNodeResponse,
} from "./types";

interface HTTPSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

export function createStreamableHTTPHandler(
  createServer: () => Server,
  sessionIdGenerator: (() => string) | undefined,
) {
  const stateful = sessionIdGenerator !== undefined;
  const sessions = new Map<string, HTTPSession>();

  return async (
    req: MCPNodeRequest,
    res: MCPNodeResponse,
    parsedBody?: unknown,
  ): Promise<void> => {
    const sessionId = readSessionId(req);

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404).end("Unknown MCP sessionId");
        return;
      }

      await session.transport.handleRequest(req, res, parsedBody);
      return;
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator,
    });

    if (stateful) {
      transport.onclose = () => {
        const activeSessionId = transport.sessionId;
        if (activeSessionId) {
          sessions.delete(activeSessionId);
        }
      };
    }

    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);

    if (stateful && transport.sessionId) {
      sessions.set(transport.sessionId, { server, transport });
    }
  };
}

function readSessionId(req: MCPNodeRequest): string | undefined {
  const header = req.headers["mcp-session-id"];
  return Array.isArray(header) ? header[0] : header;
}
