import { NextResponse } from "next/server";
import { getLatestAnalysis } from "@/lib/chip-analysis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(getLatestAnalysis(), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}