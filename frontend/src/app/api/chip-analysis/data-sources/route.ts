import { NextResponse } from "next/server";
import { getDataSources } from "@/lib/chip-analysis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const dataSources = await getDataSources();

  return NextResponse.json(dataSources, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}