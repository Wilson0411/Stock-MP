import { NextResponse } from "next/server";
import { getLatestAnalysis } from "@/lib/chip-analysis";

export function GET() {
  return NextResponse.json(getLatestAnalysis());
}