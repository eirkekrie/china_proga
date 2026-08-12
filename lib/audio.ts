import type { AudioManifest, AudioManifestEntry, Card } from "@/lib/types";
import { buildCardKey, normalizePinyin, normalizeText } from "@/lib/utils";

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
    const audio = this.audioElement;
    if (!audio) {
      return;
    }

    // Detach handlers before clearing src. Some browsers emit an asynchronous
    // error for the cleared element; that stale event must not stop the next
    // audio instance created immediately afterwards.
    this.audioElement = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  private getManifestEntry(card: Card, manifest: AudioManifest) {
    const key = buildCardKey(card);
    if (this.manifestEntryCache.has(key)) {
      return this.manifestEntryCache.get(key) ?? null;
    }

    const exactEntry = manifest.entries?.[key] ?? null;
    const normalizedHanzi = normalizeText(card.hanzi);
    const normalizedPinyin = normalizePinyin(card.pinyin);
    const matchingHanziEntries = exactEntry
      ? []
      : Object.values(manifest.entries ?? {}).filter(
          (candidate) => normalizeText(candidate.hanzi) === normalizedHanzi,
        );
    const entry =
      exactEntry ??
      matchingHanziEntries.find(
        (candidate) => normalizePinyin(candidate.pinyin) === normalizedPinyin,
      ) ??
      matchingHanziEntries[0] ??
      null;
    this.manifestEntryCache.set(key, entry);
    return entry;
  }

  private async playAudioUrl(url: string) {
    if (typeof window === "undefined") {
      return false;
    }

    let audio: HTMLAudioElement | null = null;

    try {
      this.stopCurrentAudio();
      const activeAudio = new Audio(url);
      audio = activeAudio;

      const releaseAudio = () => {
        // Ignore late events from an older element after a new playback has
        // already started.
        if (this.audioElement !== activeAudio) {
          return;
        }

        this.audioElement = null;
        activeAudio.onended = null;
        activeAudio.onerror = null;
      };

      activeAudio.preload = "auto";
      activeAudio.onended = releaseAudio;
      activeAudio.onerror = releaseAudio;

      this.audioElement = activeAudio;

      await activeAudio.play();
      return true;
    } catch {
      if (this.audioElement === audio) {
        this.stopCurrentAudio();
      }
      return false;
    }
  }

  async play(card: Card): Promise<CardAudioPlaybackResult> {
    // Avoid crossing an async boundary before audio.play() after preload: the
    // browser ties playback permission to the current user click.
    const manifest = audioManifest ?? (await loadAudioManifest());
    if (!manifest) {
      return {
        played: false,
        source: null,
        failureReason: "manifest_missing",
      };
    }

    const entry = this.getManifestEntry(card, manifest);
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
