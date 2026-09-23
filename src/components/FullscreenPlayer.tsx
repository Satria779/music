import { useEffect, useMemo, useRef } from "react";
import type { PipedTrack } from "../utils/piped";
import { getActiveLyricIndex, parseLrc, type LyricLine } from "../utils/lyrics";
import { HeartIcon, PauseIcon, PlayIcon, PrevIcon, NextIcon, ShuffleIcon, RepeatIcon, QueueIcon, LyricsIcon, ChevronDownIcon, ClockIcon, MoonIcon } from "./icons";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(safe / 60);
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

type Props = {
  open: boolean;
  track: PipedTrack | null;
  playing: boolean;
  liked: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  loadingStream: boolean;
  lyricsLoading: boolean;
  plainLyrics: string;
  syncedLyrics: string;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleLike: () => void;
  onSeek: (value: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onOpenQueue: () => void;
  onOpenSleep: () => void;
  onOpenStats: () => void;
  onArtistClick
