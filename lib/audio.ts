import type { AudioManifest, AudioManifestEntry, Card } from "@/lib/types";
import { buildCardKey } from "@/lib/utils";

export interface PronunciationEngine {
  play(card: Card): Promise<PronunciationPlaybackResult>;
}

export type PronunciationPlaybackSource = "wav" | "qwen" | "browser";

export type PronunciationPlaybackResult = {
  played: boolean;
  source: PronunciationPlaybackSource | null;
};

const PREFERRED_LANGS = ["zh-CN", "zh-Hans", "zh-HK", "zh-TW", "zh"];
const AUDIO_MANIFEST_URL = "/audio/cards/manifest.json";

let audioManifestPromise: Promise<AudioManifest | null> | null = null;

function isSpeechSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

function scoreVoice(voice: SpeechSynthesisVoice) {
  const lang = voice.lang.toLowerCase();
  const exactIndex = PREFERRED_LANGS.findIndex((candidate) => lang === candidate.toLowerCase());
  if (exactIndex >= 0) {
    return 100 - exactIndex;
  }

  const prefixIndex = PREFERRED_LANGS.findIndex((candidate) => lang.startsWith(candidate.toLowerCase()));
  if (prefixIndex >= 0) {
    return 80 - prefixIndex;
  }

  return 0;
}

function pickVoice(voices: SpeechSynthesisVoice[]) {
  return [...voices]
    .sort((left, right) => {
      const scoreDelta = scoreVoice(right) - scoreVoice(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      if (left.default !== right.default) {
        return Number(right.default) - Number(left.default);
      }

      return left.name.localeCompare(right.name);
    })
    .find((voice) => scoreVoice(voice) > 0);
}

async function loadVoices() {
  if (!isSpeechSupported()) {
    return [] as SpeechSynthesisVoice[];
  }

  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) {
    return existing;
  }

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const finish = () => {
      synth.removeEventListener("voiceschanged", finish);
      window.clearTimeout(timeoutId);
      resolve(synth.getVoices());
    };

    const timeoutId = window.setTimeout(finish, 1200);
    synth.addEventListener("voiceschanged", finish, { once: true });
  });
}

async function loadAudioManifest() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioManifestPromise) {
    audioManifestPromise = (async () => {
      try {
        const response = await fetch(AUDIO_MANIFEST_URL, {
          cache: "no-store",
        });
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as AudioManifest;
      } catch {
        return null;
      }
    })();
  }

  return audioManifestPromise;
}

class HybridPronunciationEngine implements PronunciationEngine {
  private audioElement: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private manifestEntryCache = new Map<string, AudioManifestEntry | null>();

  private stopCurrentAudio() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
      this.audioElement = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private async getManifestEntry(card: Card) {
    const key = buildCardKey(card);
    if (this.manifestEntryCache.has(key)) {
      return this.manifestEntryCache.get(key) ?? null;
    }

    const manifest = await loadAudioManifest();
    const entry = manifest?.entries?.[key] ?? null;
    this.manifestEntryCache.set(key, entry);
    return entry;
  }

  private async playAudioUrl(url: string) {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      this.stopCurrentAudio();
      const audio = new Audio(url);

      audio.onended = () => this.stopCurrentAudio();
      audio.onerror = () => this.stopCurrentAudio();

      this.audioElement = audio;

      await audio.play();
      return true;
    } catch {
      this.stopCurrentAudio();
      return false;
    }
  }

  private async playPreGenerated(card: Card) {
    const entry = await this.getManifestEntry(card);
    if (!entry?.path) {
      return false;
    }

    return this.playAudioUrl(entry.path);
  }

  private async playRemote(card: Card) {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: card.hanzi.trim() || card.pinyin.trim(),
          pinyin: card.pinyin.trim(),
        }),
      });

      if (!response.ok) {
        return false;
      }

      const blob = await response.blob();
      if (!blob.size) {
        return false;
      }

      this.stopCurrentAudio();

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => this.stopCurrentAudio();
      audio.onerror = () => this.stopCurrentAudio();

      this.objectUrl = url;
      this.audioElement = audio;

      await audio.play();
      return true;
    } catch {
      this.stopCurrentAudio();
      return false;
    }
  }

  private async playBrowser(card: Card) {
    if (!isSpeechSupported()) {
      return false;
    }

    const text = card.hanzi.trim() || card.pinyin.trim();
    if (!text) {
      return false;
    }

    try {
      const synth = window.speechSynthesis;
      const voices = await loadVoices();
      const voice = pickVoice(voices);
      const utterance = new SpeechSynthesisUtterance(text);

      utterance.lang = voice?.lang || "zh-CN";
      utterance.voice = voice ?? null;
      utterance.rate = 0.82;
      utterance.pitch = 1;
      utterance.volume = 1;

      synth.cancel();
      if (synth.paused) {
        synth.resume();
      }

      synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  async play(card: Card): Promise<PronunciationPlaybackResult> {
    const preGeneratedPlayed = await this.playPreGenerated(card);
    if (preGeneratedPlayed) {
      return {
        played: true,
        source: "wav",
      };
    }

    const remotePlayed = await this.playRemote(card);
    if (remotePlayed) {
      return {
        played: true,
        source: "qwen",
      };
    }

    const browserPlayed = await this.playBrowser(card);
    return {
      played: browserPlayed,
      source: browserPlayed ? "browser" : null,
    };
  }
}

export const pronunciationEngine = new HybridPronunciationEngine();
