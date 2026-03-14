import type { AudioManifest, AudioManifestEntry, Card } from "@/lib/types";
import { buildCardKey } from "@/lib/utils";

export interface PronunciationEngine {
  play(card: Card): Promise<PronunciationPlaybackResult>;
}

export type PronunciationPlaybackSource = "wav";

export type PronunciationPlaybackResult = {
  played: boolean;
  source: PronunciationPlaybackSource | null;
};

const AUDIO_MANIFEST_URL = "/audio/cards/manifest.json";

let audioManifestPromise: Promise<AudioManifest | null> | null = null;

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
  private manifestEntryCache = new Map<string, AudioManifestEntry | null>();

  private stopCurrentAudio() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
      this.audioElement = null;
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

  async play(card: Card): Promise<PronunciationPlaybackResult> {
    const preGeneratedPlayed = await this.playPreGenerated(card);
    if (preGeneratedPlayed) {
      return {
        played: true,
        source: "wav",
      };
    }

    return {
      played: false,
      source: null,
    };
  }
}

export const pronunciationEngine = new HybridPronunciationEngine();
