// Server-only transport: the application key never reaches browser code.
const endpoint = "https://c-gw.variflight.com/chat_message/mcp/api";
const readOnlyTools = new Set(["searchAirport", "getRouteFlightTickets", "getFlightTicketPrice", "domesticDirectTrainSearch", "trainDetail"]);
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function decodeRpc(text: string): ObjectValue {
  // Streamable HTTP may answer either JSON or an SSE stream with notifications.
  const messages = text.trim().startsWith("{") ? [text] : text.split(/\r?\n\r?\n/).map(block => block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n")).filter(Boolean);
  for (const message of messages.reverse()) {
    try { const value: unknown = JSON.parse(message); if (object(value) && ("result" in value || "error" in value)) return value; } catch { /* Ignore stream notifications, not malformed results. */ }
  }
  throw new Error("invalid-provider-response");
}

export class VariflightClient {
  private session = "";
  private sequence = 0;
  private protocol = "2025-03-26";
  private key: string;
  private signal: AbortSignal;
  private flightTool = "";
  constructor(key: string, signal: AbortSignal) { this.key = key; this.signal = signal; }
  private async send(method: string, params: unknown, notification = false): Promise<unknown> {
    const response = await fetch(endpoint, {
      method: "POST", cache: "no-store", redirect: "error", signal: this.signal,
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(this.session ? { "Mcp-Session-Id": this.session, "MCP-Protocol-Version": this.protocol } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: ++this.sequence }), method, params }),
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "provider-authorization" : "provider-unavailable");
    this.session = response.headers.get("mcp-session-id") || this.session;
    if (notification) return undefined;
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error("provider-response-too-large");
    const rpc = decodeRpc(body);
    if (rpc.error) throw new Error("provider-tool-error");
    return rpc.result;
  }
  async initialize() {
    const result = await this.send("initialize", { protocolVersion: this.protocol, capabilities: {}, clientInfo: { name: "xingzhi-ticket-search", version: "1.0.0" } });
    if (object(result) && typeof result.protocolVersion === "string") this.protocol = result.protocolVersion;
    await this.send("notifications/initialized", {}, true);
    // Deployments expose different names. Accept only a tool whose schema requires SQL,
    // never the similarly named historical price-calendar/forecast tool.
    const catalog = await this.send("tools/list", {});
    if (object(catalog) && Array.isArray(catalog.tools)) {
      for (const name of ["getRouteFlightTickets", "getFlightTicketPrice"]) {
        const tool = catalog.tools.find(tool => object(tool) && tool.name === name);
        if (object(tool) && object(tool.inputSchema) && Array.isArray(tool.inputSchema.required) && tool.inputSchema.required.includes("sql") && object(tool.inputSchema.properties) && object(tool.inputSchema.properties.sql) && tool.inputSchema.properties.sql.type === "string") { this.flightTool = name; break; }
      }
    }
  }
  async flightSearch(sql: string) {
    if (!this.flightTool) throw new Error("live-flight-tool-unavailable");
    return this.call(this.flightTool, { sql });
  }
  async call(name: string, args: ObjectValue) {
    if (!readOnlyTools.has(name)) throw new Error("unsupported-tool");
    const result = await this.send("tools/call", { name, arguments: args });
    if (!object(result) || result.isError) throw new Error("provider-tool-error");
    const values: unknown[] = [];
    if (result.structuredContent) values.push(result.structuredContent);
    const blocks = Array.isArray(result.content) ? result.content : [];
    for (const block of blocks) {
      if (!object(block)) continue;
      if (block.type === "resource_link" && typeof block.uri === "string") {
        values.push(await this.send("resources/read", { uri: block.uri }));
      } else if (block.type === "resource" && object(block.resource)) values.push(block.resource);
      else if (block.type === "text" && typeof block.text === "string") values.push(block.text);
    }
    return values;
  }
}

/** Inspect JSON/embedded resources only. Never treat prose or search snippets as fares. */
export function providerObjects(value: unknown, depth = 0): ObjectValue[] {
  if (depth > 12) return [];
  if (typeof value === "string") {
    try { return providerObjects(JSON.parse(value), depth + 1); } catch { return []; }
  }
  if (Array.isArray(value)) return value.flatMap(item => providerObjects(item, depth + 1));
  if (!object(value)) return [];
  const columns = Array.isArray(value.columns) ? value.columns.map(column => typeof column === "string" ? column : object(column) && typeof column.name === "string" ? column.name : "") : [];
  const rows = columns.length && columns.every(Boolean) && Array.isArray(value.rows) ? value.rows.filter(Array.isArray).map(row => Object.fromEntries(columns.map((key, index) => [key, row[index]]))) : [];
  return [value, ...rows, ...Object.values(value).flatMap(item => providerObjects(item, depth + 1))];
}
