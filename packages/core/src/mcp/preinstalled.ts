import type { McpHttpConfig, McpStdioConfig, McpTransport } from "../contract";

export const PREINSTALLED_MCP_SERVER_IDS = {
  exa: "mcp_exa",
  firecrawl: "mcp_firecrawl",
  titen: "mcp_titen",
} as const;

export type PreinstalledMcpServerDefinition = {
  id: string;
  name: string;
  transport: McpTransport;
  config: McpHttpConfig | McpStdioConfig;
};

export const preinstalledMcpServers: PreinstalledMcpServerDefinition[] = [
  {
    config: {
      url: "https://mcp.exa.ai/mcp",
    },
    id: PREINSTALLED_MCP_SERVER_IDS.exa,
    name: "exa",
    transport: "http",
  },
  {
    config: {
      url: "https://mcp.firecrawl.dev/v2/mcp",
    },
    id: PREINSTALLED_MCP_SERVER_IDS.firecrawl,
    name: "firecrawl",
    transport: "http",
  },
  {
    // Titen serves its own local SQLite store when neither TITEN_MCP_URL nor
    // TITEN_API_KEY is set, so memory works with no key and no extra service.
    // Set both to point a profile at a served instance instead.
    config: {
      args: ["mcp"],
      command: "titen",
    },
    id: PREINSTALLED_MCP_SERVER_IDS.titen,
    name: "titen",
    transport: "stdio",
  },
];

export const PREINSTALLED_MCP_SERVER_ID_SET = new Set<string>(
  Object.values(PREINSTALLED_MCP_SERVER_IDS)
);

export function isPreinstalledMcpServerId(serverId: string): boolean {
  return PREINSTALLED_MCP_SERVER_ID_SET.has(serverId);
}
