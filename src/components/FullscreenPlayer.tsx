import { useEffect, useMemo, useRef } from "react";
import type { PipedTrack } from "../utils/piped";
import { getActiveLyricIndex, parseLrc, type LyricLine } from "../utils/lyrics";
import {
  HeartIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  NextIcon,
  ShuffleIcon,
  RepeatIcon,
  QueueIcon,
  LyricsIcon,
  ChevronDownIcon,
  ClockIcon,
  MoonIcon,
} from "./icons";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(safe / 60);
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

type RepeatMode = "off" | "all" | "one";

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
  repeat: RepeatMode;
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
  onArtistClick?: () => void;
  accent: string;
};

export function FullscreenPlayer(props: Props) {
  const {
    open, track, playing, liked, progress, currentTime, duration,
    loadingStream, lyricsLoading, plainLyrics, syncedLyrics, shuffle, repeat,
    onClose, onTogglePlay, onPrev, onNext, onToggleLike, onSeek,
    onToggleShuffle, onCycleRepeat, onOpenQueue, onOpenSleep, onOpenStats,
    onArtistClick, accent,
  } = props;

  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const lines = useMemo<LyricLine[]>(() => {
    const synced = parseLrc(syncedLyrics);
    if (synced.length > 0) return synced;
    return plainLyrics
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((text, index) => ({ time: index * 4, text }));
  }, [plainLyrics, syncedLyrics]);

  const activeIndex = useMemo(() => getActiveLyricIndex(lines, currentTime), [lines, currentTime]);

  useEffect(() => {
    if (!open) return;
    const container = listRef.current;
    const active = itemRefs.current[activeIndex];
    if (!container || !active || activeIndex < 0) return;
    const top = container.scrollTop;
    const bottom = top + container.clientHeight;
    const lineTop = active.offsetTop;
    const lineBottom = lineTop + active.clientHeight;
    if (lineTop < top + 32 || lineBottom > bottom - 32) {
      container.scrollTo({
        top: Math.max(lineTop - container.clientHeight / 2 + active.clientHeight, 0),
        behavior: "smooth",
      });
    }
  }, [activeIndex, open]);

  if (!open) return null;

  return (
    <div className="fullscreen-player">
      <div className="fs-bg" style={{ backgroundImage: track?.artwork ? `url(${track.artwork})` : undefined }} />
      <div className="fs-scrim" />
      <div className="fs-shell" style={{ ["--fs-accent" as string]: accent }}>
        <header className="fs-header">
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Tutup">
            <ChevronDownIcon className="icon-22" />
          </button>
          <div className="fs-header-text">
            <span>Sedang diputar</span>
            <strong>{track?.title || "-"}</strong>
          </div>
          <div className="fs-header-actions">
            <button type="button" className="icon-ghost-btn" onClick={onOpenSleep} aria-label="Sleep timer">
              <MoonIcon className="icon-20" />
            </button>
            <button type="button" className="icon-ghost-btn" onClick={onOpenStats} aria-label="Statistik">
              <ClockIcon className="icon-20" />
            </button>
          </div>
        </header>

        <div className="fs-content">
          <div className="fs-art-wrap">
            <img className="fs-art" src={track?.artwork} alt={track?.title || "Artwork"} />
          </div>

          <div className="fs-track-info">
            <div className="fs-track-copy">
              <h1 className="fs-title">{track?.title || "-"}</h1>
              <button type="button" className="fs-artist" onClick={onArtistClick}>
                {track?.artist || "Artis"}
              </button>
            </div>
            <button
              type="button"
              className={`icon-ghost-btn ${liked ? "liked" : ""}`}
              onClick={onToggleLike}
              aria-label="Suka"
            >
              <HeartIcon filled={liked} />
            </button>
          </div>

          <div className="fs-progress">
            <input
              type="range"
              className="music-range fs-range"
              min={0}
              max={duration || track?.duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || track?.duration || 0)}
              onChange={(e) => onSeek(Number(e.target.value))}
              style={{ ["--range-progress" as string]: `${progress}%` }}
            />
            <div className="fs-time">
              <span>{formatTime(currentTime)}</span>
              <span>{loadingStream ? "Memuat..." : formatTime(duration || track?.duration || 0)}</span>
            </div>
          </div>

          <div className="fs-controls">
            <button
              type="button"
              className={`icon-ghost-btn fs-ctrl ${shuffle ? "active" : ""}`}
              onClick={onToggleShuffle}
              aria-label="Shuffle"
            >
              <ShuffleIcon className="icon-22" />
            </button>
            <button type="button" className="icon-ghost-btn fs-ctrl" onClick={onPrev} aria-label="Sebelumnya">
              <PrevIcon />
            </button>
            <button
              type="button"
              className="play-pause-btn-ref fs-play"
              onClick={onTogglePlay}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button type="button" className="icon-ghost-btn fs-ctrl" onClick={onNext} aria-label="Berikutnya">
              <NextIcon />
            </button>
            <button
              type="button"
              className={`icon-ghost-btn fs-ctrl ${repeat !== "off" ? "active" : ""}`}
              onClick={onCycleRepeat}
              aria-label={`Repeat ${repeat}`}
            >
              <RepeatIcon className="icon-22" mode={repeat} />
            </button>
          </div>

          <div className="fs-secondary-row">
            <button type="button" className="pill-soft" onClick={onOpenQueue}>
              <QueueIcon className="icon-18" />
              <span>Queue</span>
            </button>
            <button type="button" className="pill-soft" onClick={onOpenSleep}>
              <MoonIcon className="icon-18" />
              <span>Sleep</span>
            </button>
          </div>

          <section className="fs-lyrics-block" aria-live="polite">
            <header className="fs-lyrics-header">
              <LyricsIcon className="icon-18" />
              <span>
                {lyricsLoading ? "Memuat lirik..." : lines.length > 0 ? "Lirik" : "Lirik belum tersedia"}
              </span>
            </header>
            <div className="fs-lyrics-list" ref={listRef}>
              {lines.length > 0 ? (
                lines.map((line, index) => (
                  <button
                    key={`${line.time}-${index}`}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    className={`fs-lyric-line ${index === activeIndex ? "active" : ""}`}
                    onClick={() => line.time >= 0 && onSeek(line.time)}
                  >
                    {line.text}
                  </button>
                ))
              ) : (
                <div className="empty-copy">Putar lagu untuk melihat lirik.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
