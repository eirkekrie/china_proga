import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { normalizePersistedState, type PersistedAppState } from "@/lib/storage";
import { loadUserDatabaseState, saveUserDatabaseState } from "@/lib/sqlite-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json(loadUserDatabaseState(user.id));
}

export async function PUT(request: Request) {
  const user = getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as Partial<PersistedAppState>;
    const normalized = normalizePersistedState(payload);
    return NextResponse.json(saveUserDatabaseState(user.id, normalized));
  } catch {
    return NextResponse.json({ error: "Invalid state payload" }, { status: 400 });
  }
}
