import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bluesky MCP Server",
  description: "Model Context Protocol server for Bluesky",
  metadataBase: new URL(`https://${process.env.VERCEL_URL || "bluesky-mcp.vercel.app"}`),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Bluesky MCP Server",
    description: "Model Context Protocol server for Bluesky",
    images: [{ url: "/bluesky-logo.png", alt: "Bluesky MCP Server" }],
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bluesky MCP Server",
    description: "Model Context Protocol server for Bluesky",
    images: ["/bluesky-logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: "#0a0a0a", margin: 0 }}>
      <body style={{ background: "#0a0a0a", margin: 0 }}>{children}</body>
    </html>
  );
}
