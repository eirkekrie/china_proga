import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PRONUNCIATION_SERVER_URL = "http://127.0.0.1:8002/assess";
const DEFAULT_PRONUNCIATION_LANGUAGE = "zh";

function getServerUrl() {
  return process.env.PRONUNCIATION_SERVER_URL?.trim() || DEFAULT_PRONUNCIATION_SERVER_URL;
}

function getLanguage() {
  return process.env.PRONUNCIATION_LANGUAGE?.trim() || DEFAULT_PRONUNCIATION_LANGUAGE;
}

export async function POST(request: NextRequest) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      {
        error: "Invalid form data.",
      },
      { status: 400 },
    );
  }

  const audioEntry = formData.get("audio");
  const expectedHanzi = String(formData.get("expectedHanzi") ?? "").trim();
  const expectedPinyin = String(formData.get("expectedPinyin") ?? "").trim();
  const durationMs = Number(formData.get("durationMs") ?? "0");

  if (!(audioEntry instanceof File)) {
    return Response.json(
      {
        error: "Audio file is required.",
      },
      { status: 400 },
    );
  }

  if (!expectedHanzi || !expectedPinyin) {
    return Response.json(
      {
        error: "Expected hanzi and pinyin are required.",
      },
      { status: 400 },
    );
  }

  const arrayBuffer = await audioEntry.arrayBuffer();
  const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const upstream = await fetch(getServerUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audioBase64,
        mimeType: audioEntry.type || "application/octet-stream",
        expectedHanzi,
        expectedPinyin,
        durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
        language: getLanguage(),
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstream.ok) {
      const details = await upstream.text();
      return Response.json(
        {
          error: "Local pronunciation server request failed.",
          details,
        },
        { status: upstream.status },
      );
    }

    const payload = await upstream.json();
    return Response.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    return Response.json(
      {
        error: "Local pronunciation server is unreachable.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 503 },
    );
  }
}
