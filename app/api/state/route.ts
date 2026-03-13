import { NextResponse } from "next/server";
import { normalizePersistedState, type PersistedAppState } from "@/lib/storage";
import { loadDatabaseState, saveDatabaseState } from "@/lib/sqlite-state";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(loadDatabaseState());
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as Partial<PersistedAppState>;
    const normalized = normalizePersistedState(payload);
    return NextResponse.json(saveDatabaseState(normalized));
  } catch {
    return NextResponse.json({ error: "Invalid state payload" }, { status: 400 });
  }
}
