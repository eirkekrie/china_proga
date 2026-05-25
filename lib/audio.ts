import type { AudioManifest, AudioManifestEntry, Card } from "@/lib/types";
import { buildCardKey } from "@/lib/utils";

export interface CardAudioEngine {
  play(card: Card): Promise<CardAudioPlaybackResult>;
}

export type CardAudioPlaybackSource = "wav";

export type CardAudioPlaybackResult = {
  played: boolean;
  source: CardAudioPlaybackSource | null;
  failureReason?: "manifest_missing" | "entry_missing" | "playback_failed";
};

const AUDIO_MANIFEST_URL = "/audio/cards/manifest.json";

let audioManifest: AudioManifest | null = null;
let audioManifestPromise: Promise<AudioManifest | null> | null = null;

async function loadAudioManifest() {
  if (typeof window === "undefined") {
    return null;
  }

  if (audioManifest) {
    return audioManifest;
  }

  if (!audioManifestPromise) {
    const pendingManifest = (async () => {
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

    audioManifestPromise = pendingManifest;
    pendingManifest.then((manifest) => {
      if (audioManifestPromise === pendingManifest) {
        audioManifestPromise = null;
      }

      if (manifest) {
        audioManifest = manifest;
      }
    });
  }

  return audioManifestPromise;
}

export function preloadCardAudioManifest() {
  void loadAudioManifest();
}

class WavCardAudioEngine implements CardAudioEngine {
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

  async play(card: Card): Promise<CardAudioPlaybackResult> {
    const manifest = await loadAudioManifest();
    if (!manifest) {
      return {
        played: false,
        source: null,
        failureReason: "manifest_missing",
      };
    }

    const entry = await this.getManifestEntry(card);
    if (!entry?.path) {
      return {
        played: false,
        source: null,
        failureReason: "entry_missing",
      };
    }

    if (await this.playAudioUrl(entry.path)) {
      return {
        played: true,
        source: "wav",
      };
    }

    return {
      played: false,
      source: null,
      failureReason: "playback_failed",
    };
  }
}

export const cardAudioEngine = new WavCardAudioEngine();
