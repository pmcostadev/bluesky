import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "ok",
    service: "bluesky-mcp",
    timestamp: new Date().toISOString(),
  });
}