import { NextResponse } from "next/server";
import { getDataSources } from "@/lib/chip-analysis";

export function GET() {
  return NextResponse.json(getDataSources());
}