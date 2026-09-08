export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#0a0a0a",
        color: "#fff",
        padding: "2rem",
      }}
    >
      <img
        src="/bluesky-logo.png"
        alt="Bluesky logo"
        width={120}
        height={120}
        style={{
          width: "120px",
          height: "auto",
          marginBottom: "1.5rem",
          borderRadius: "24px",
        }}
      />
      <h1 style={{ fontSize: "2.5rem", margin: "0 0 0.75rem", textAlign: "center" }}>
        Bluesky MCP Server
      </h1>
      <p style={{ color: "#888", margin: 0, fontSize: "1.1rem", textAlign: "center" }}>
        Model Context Protocol server for Bluesky
      </p>
      <div
        style={{
          marginTop: "2rem",
          padding: "1rem 1.5rem",
          background: "#1a1a1a",
          borderRadius: "12px",
        }}
      >
        <code style={{ color: "#4ade80", fontSize: "0.95rem" }}>
          POST /mcp - Send JSON-RPC requests
        </code>
      </div>
    </div>
  );
}
