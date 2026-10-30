import { NextResponse } from "next/server";
import { importClientBundle, type ClientSyncBundle } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const bundle = (await req.json()) as ClientSyncBundle;
    importClientBundle(bundle);
    return NextResponse.json({ synced: true });
  } catch {
    return NextResponse.json({ synced: false }, { status: 400 });
  }
}

