import { NextResponse } from "next/server";
import { getBacktestSummary } from "@/lib/chip-analysis";

export function GET() {
  return NextResponse.json(getBacktestSummary());
}