import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(req: NextRequest) {
  return NextResponse.json({
    base_url: process.env.ANALYTICS_API_URL,
  });
}
