# `@pen/mcp`

MCP provider for Pen editors and document-op tool servers.

`createMCPServer()` is for process-scoped `stdio` servers.
`createMCPRequestHandler()` is for request-scoped HTTP transports that need to be mounted into your own Node server.

## Stdio

If you already have a Pen editor, you can expose its document-op tools over MCP `stdio`:

```ts
import { createEditor } from "@pen/core";
import { createMCPServer } from "@pen/mcp";

const editor = createEditor();
const server = createMCPServer({ editor });

await server.start();
```

`createEditor()` includes the document-ops extension by default, so `@pen/mcp` can resolve the tool server from `editor.internals`.

## Streamable HTTP

For HTTP hosts, prefer Streamable HTTP over SSE. Mount the request handler into your existing Node server and pass any pre-parsed JSON body through as the third argument.

```ts
import express from "express";
import { createEditor } from "@pen/core";
import { createMCPRequestHandler } from "@pen/mcp";

const app = express();
const editor = createEditor();
const mcp = createMCPRequestHandler({
  editor,
  sessionIdGenerator: undefined,
});

app.use("/mcp", express.json());

app.all("/mcp", async (req, res) => {
  await mcp.handleStreamableHTTP(req, res, req.body);
});

app.listen(3000);
```

Use `sessionIdGenerator: undefined` for stateless handling. If you want stateful sessions, provide a generator such as `() => crypto.randomUUID()`.

## SSE Compatibility

SSE is request-scoped too, so it must be mounted on an HTTP server instead of started through `createMCPServer()`.

```ts
import express from "express";
import { createEditor } from "@pen/core";
import { createMCPRequestHandler } from "@pen/mcp";

const app = express();
const editor = createEditor();
const mcp = createMCPRequestHandler({
  editor,
  path: "/mcp/sse",
});

app.use("/mcp/sse", express.json());

app.get("/mcp/sse", async (req, res) => {
  await mcp.handleSSE(req, res);
});

app.post("/mcp/sse", async (req, res) => {
  await mcp.handleSSE(req, res, req.body);
});

app.listen(3000);
```

The initial `GET /mcp/sse` establishes the event stream. The SDK then tells the client which POST endpoint to use, including the generated `sessionId`.
