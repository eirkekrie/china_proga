import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_QWEN_TTS_SERVER_URL = "http://127.0.0.1:8001/synthesize";
const DEFAULT_QWEN_TTS_LANGUAGE = "Chinese";

function getServerUrl() {
  return process.env.QWEN_TTS_SERVER_URL?.trim() || DEFAULT_QWEN_TTS_SERVER_URL;
}

function getLanguage() {
  return process.env.QWEN_TTS_LANGUAGE?.trim() || DEFAULT_QWEN_TTS_LANGUAGE;
}

export async function POST(request: NextRequest) {
  let body: { text?: string; pinyin?: string } | null = null;

  try {
    body = (await request.json()) as { text?: string; pinyin?: string };
  } catch {
    return Response.json(
      {
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const text = body?.text?.trim();
  if (!text) {
    return Response.json(
      {
        error: "Text is required.",
      },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const upstream = await fetch(getServerUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        pinyin: body?.pinyin?.trim() || null,
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
          error: "Local Qwen TTS request failed.",
          details,
        },
        { status: upstream.status },
      );
    }

    const arrayBuffer = await upstream.arrayBuffer();
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "audio/wav",
        "Cache-Control": "no-store",
        "X-TTS-Engine": upstream.headers.get("x-tts-engine") || "qwen3-tts-local",
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    return Response.json(
      {
        error: "Local Qwen TTS server is unreachable.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 503 },
    );
  }
}
