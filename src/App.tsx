import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import ReactPlayer from "react-player";
import { getActiveLyricIndex, getLyrics, parseLrc, type LyricLine } from "./utils/lyrics";
import {
  getSearchSuggestions,
  getTrackPlaybackSource,
  getTrendingTracks,
  searchAlbums,
  searchArtists,
  searchPlaylists,
  searchTracks,
  type PlayableSource,
} from "./utils/musicApi";
import { getPlaylistTracks, type PipedArtist, type PipedCollection, type PipedTrack } from "./utils/piped";
import { readStorage, writeStorage, STORAGE_KEYS } from "./utils/storage";
import { extractThemeFromImage, type ThemeAccent } from "./utils/color";
import { deriveStats, EMPTY_STATS, type MusicStats } from "./utils/statistics";
import { useMediaSession } from "./hooks/useMediaSession";
import { useToast } from "./hooks/useToast";
import { ToastStack } from "./components/Toast";
import { QueueSheet } from "./components/QueueSheet";
import { SleepTimerSheet } from "./components/SleepTimerSheet";
import { FullscreenPlayer } from "./components/FullscreenPlayer";
import { StatisticsSheet } from "./components/StatisticsSheet";
import { PlaylistSheet, type CustomPlaylist } from "./components/PlaylistSheet";
import {
  HomeIcon,
  SearchIcon,
  LibraryIcon,
  HeartIcon,
  MusicIcon,
  BroadcastIcon,
  SpeakerLowIcon,
  SpeakerHighIcon,
  PrevIcon,
  NextIcon,
  PlayIcon,
  PauseIcon,
  ChevronDownIcon,
  MenuIcon,
  PlusIcon,
  QueueIcon,
  ShuffleIcon,
  RepeatIcon,
  ExpandIcon,
  LyricsIcon,
  XIcon,
  ClockIcon,
  TrashIcon,
} from "./components/icons";

type MainView = "home" | "search" | "library";
type ActiveView = MainView | "artist" | "stats";

type FeedSection = { id: string; title: string; tracks: PipedTrack[] };
type SearchBundle = { tracks: PipedTrack[]; albums: PipedCollection[]; playlists: PipedCollection[]; artists: PipedArtist[] };
type ArtistDetail = { artist: PipedArtist; tracks: PipedTrack[]; albums: PipedCollection[]; playlists: PipedCollection[] };
type RepeatMode = "off" | "all" | "one";

const QUICK_SEARCHES = ["Hindia", "Membasuh", "Kunto Aji", "Feast", "Pamungkas", "Nadin Amizah"];
const SEARCH_DEBOUNCE = 320;
const RECENT_LIMIT = 50;
const SEARCH_HISTORY_LIMIT = 12;

const searchCategories = [
  { title: "Pop Indonesia", color: "#e13300", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80" },
  { title: "Galau", color: "#5038a0", image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=400&q=80" },
  { title: "TikTok Viral", color: "#15883e", image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=400&q=80" },
  { title: "Focus Mode", color: "#1e3264", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80" },
  { title: "Acoustic", color: "#ba5d07", image: "https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=400&q=80" },
  { title: "Late Night", color: "#0d5c63", image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=400&q=80" },
];

function formatTime(seconds: number) {
  const safeValue = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeValue / 60);
  const remainingSeconds = String(safeValue % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function dedupeTracks(tracks: PipedTrack[]) {
  const map = new Map<string, PipedTrack>();
  tracks.forEach((track) => {
    if (!map.has(track.id)) map.set(track.id, track);
  });
  return Array.from(map.values());
}

function cleanForLyrics(value: string) {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/official/gi, "")
    .replace(/audio/gi, "")
    .replace(/video/gi, "")
    .replace(/lyric/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function primaryArtistName(value: string) {
  return value.split(",")[0]?.trim() || value.trim();
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function artistFromTrack(track: PipedTrack): PipedArtist {
  return {
    id: primaryArtistName(track.artist).toLowerCase().replace(/\s+/g, "-"),
    name: primaryArtistName(track.artist),
    artwork: track.artwork,
    subscribersText: "Artis",
  };
}

function filterHomeTracks(tracks: PipedTrack[]) {
  const blocked = /\b(yoga|meditation|mantra|bhajan|chant|nursery|kids|children|rhymes|podcast|live|dj set|mix nonstop|remix nonstop|hindi|bollywood|megamix|nonstop|psynth|gym beats)\b/i;
  const blockedTitles = [
    "gym beats vol.4-nonstop-megamix",
    "bollywood dj non stop remix(remix by dj jitesh,psynth)",
    "the gym beats",
  ];
  return tracks.filter((track) => {
    const target = `${track.title} ${track.artist}`.toLowerCase();
    if (blocked.test(target)) return false;
    return !blockedTitles.some((title) => target.includes(title));
  });
}

function chooseBestArtistMatch(targetName: string, artists: PipedArtist[]) {
  const normalizedTarget = normalizeName(targetName);
  return (
    artists.find((item) => normalizeName(item.name) === normalizedTarget) ||
    artists.find((item) => normalizeName(item.name).startsWith(normalizedTarget)) ||
    artists.find((item) => normalizedTarget.startsWith(normalizeName(item.name))) ||
    artists[0] ||
    null
  );
}

function isTrackFromArtist(track: PipedTrack, artistName: string) {
  const normalizedArtist = normalizeName(artistName);
  const trackArtist = normalizeName(primaryArtistName(track.artist));
  return trackArtist === normalizedArtist || trackArtist.includes(normalizedArtist) || normalizedArtist.includes(trackArtist);
}

function isCollectionFromArtist(item: PipedCollection, artistName: string) {
  const normalizedArtist = normalizeName(artistName);
  const creator = normalizeName(item.creator);
  const title = normalizeName(item.title);
  return creator.includes(normalizedArtist) || title.includes(normalizedArtist);
}

/* Small components reused from original file (Skeleton, TrackRow, etc.) preserved above. */

function Equalizer({ active }: { active: boolean }) {
  return (
    <div className="eq-wrap compact">
      {[0, 140, 280, 420].map((delay, index) => (
        <span key={delay} className={`eq-bar ${active ? "animate" : ""}`} style={{ height: `${10 + index * 4}px`, animationDelay: `${delay}ms` }} />
      ))}
    </div>
  );
}

function BrandNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 16.8V7.2l8-1.8v9.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="17.4" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="16.6" r="2.6" fill="currentColor" stroke="none" />
      <path d="M10 10.1 18 8.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SkeletonRecentList() {
  return (
    <div className="vertical-list">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="skeleton-row">
          <div className="skeleton skeleton-cover" />
          <div className="skeleton-copy">
            <div className="skeleton skeleton-line long" />
            <div className="skeleton skeleton-line short" />
          </div>
          <div className="skeleton skeleton-dot" />
        </div>
      ))}
    </div>
  );
}

function SkeletonHorizontalRow() {
  return (
    <div className="horizontal-scroll">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-card skeleton-card">
          <div className="skeleton skeleton-art" />
          <div className="skeleton skeleton-line long" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function SkeletonArtistProfile() {
  return (
    <>
      <div className="artist-hero">
        <div className="back-btn skeleton-circle" />
        <div className="artist-hero-meta">
          <div className="artist-hero-img skeleton-circle big" />
          <div className="artist-hero-copy">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line medium" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      </div>
      <div className="section-container">
        <h2 className="section-title">Populer</h2>
        <SkeletonRecentList />
      </div>
    </>
  );
}

function TrackRow({
  track,
  active,
  onClick,
  onArtistClick,
  onLike,
  onAddToQueue,
  liked,
  right,
}: {
  track: PipedTrack;
  active?: boolean;
  onClick: () => void;
  onArtistClick?: () => void;
  onLike?: () => void;
  onAddToQueue?: () => void;
  liked?: boolean;
  right?: ReactNode;
}) {
  return (
    <div className={`v-item ${active ? "active" : ""}`}>
      <button type="button" className="track-cover-btn" onClick={onClick}>
        <img className="v-img" src={track.artwork} alt={track.title} loading="lazy" />
      </button>
      <div className="v-info text-left">
        <button type="button" className="track-title-btn" onClick={onClick}>
          <div className="v-title">{track.title}</div>
        </button>
        <button type="button" className="artist-link-btn" onClick={onArtistClick}>
          <div className="v-sub">{track.artist}</div>
        </button>
      </div>
      <div className="v-actions">
        {onLike ? (
          <button type="button" className={`icon-ghost-btn ${liked ? "liked" : ""}`} onClick={onLike} aria-label="Suka">
            <HeartIcon filled={liked} />
          </button>
        ) : null}
        {onAddToQueue ? (
          <button type="button" className="icon-ghost-btn" onClick={onAddToQueue} aria-label="Tambah ke queue">
            <PlusIcon className="icon-18" />
          </button>
        ) : null}
        {right ? (
          <button type="button" className="dots-icon track-right-btn" onClick={onClick}>
            {right}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function HorizontalTrackCard({
  track,
  onClick,
  onArtistClick,
}: {
  track: PipedTrack;
  onClick: () => void;
  onArtistClick?: () => void;
}) {
  return (
    <div className="h-card text-left">
      <button type="button" className="h-card-main" onClick={onClick}>
        <img className="h-img" src={track.artwork} alt={track.title} loading="lazy" />
        <div className="h-title">{track.title}</div>
      </button>
      <button type="button" className="artist-link-btn horizontal" onClick={onArtistClick}>
        <div className="h-sub">{track.artist}</div>
      </button>
    </div>
  );
}

function HorizontalCollectionCard({ item, onClick }: { item: PipedCollection; onClick: () => void }) {
  return (
    <button type="button" className="h-card text-left" onClick={onClick}>
      <img className="h-img" src={item.artwork} alt={item.title} loading="lazy" />
      <div className="h-title">{item.title}</div>
      <div className="h-sub">{item.creator}</div>
    </button>
  );
}

function HorizontalArtistCard({ artist, onClick }: { artist: PipedArtist; onClick: () => void }) {
  return (
    <button type="button" className="h-card text-left" onClick={onClick}>
      <img className="h-img artist-img" src={artist.artwork} alt={artist.name} loading="lazy" />
      <div className="h-title">{artist.name}</div>
      <div className="h-sub">{artist.subscribersText} subscriber</div>
    </button>
  );
}

function PlayerCard({
  track,
  playing,
  liked,
  progress,
  currentTime,
  duration,
  volume,
  loadingStream,
  shuffle,
  repeat,
  queueCount,
  sleepRemainingMs,
  onClose,
  onTogglePlay,
  onPrev,
  onNext,
  onLike,
  onMenu,
  onArtistClick,
  onSeek,
  onVolume,
  onToggleShuffle,
  onCycleRepeat,
  onOpenQueue,
  onOpenLyrics,
  onOpenSleep,
  onOpenPlaylist,
}: {
  track: PipedTrack | null;
  playing: boolean;
  liked?: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
  loadingStream: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  queueCount: number;
  sleepRemainingMs: number;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLike: () => void;
  onMenu: () => void;
  onArtistClick?: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onOpenQueue: () => void;
  onOpenLyrics: () => void;
  onOpenSleep: () => void;
  onOpenPlaylist: () => void;
}) {
  return (
    <div className="player-phone-shell">
      <div className="player-grab-bar" />
      <div className="player-modal-header">
        <button type="button" className="player-top-btn" onClick={onClose}><ChevronDownIcon /></button>
        <div className="player-header-text leftish">
          <span>Memainkan Lagu</span>
          <strong>{track?.title || "Music"}</strong>
        </div>
        <button type="button" className="player-top-btn" onClick={onMenu}><MenuIcon /></button>
      </div>

      <div className="player-card-box">
        <div className="player-card-surface">
          <div className="player-rail desktop-only">
            <button type="button" className="rail-btn" onClick={onLike}><HeartIcon filled={liked} /></button>
            <button type="button" className="rail-btn"><MusicIcon /></button>
            <button type="button" className="rail-btn"><BroadcastIcon /></button>
          </div>

          <div className="player-art-container-ref">
            <img src={track?.artwork || "/images/satriamusic-cover.jpg"} alt={track?.title || "Album Art"} />
          </div>

          <div className="player-track-info-ref left-align">
            <div className="player-track-copy left-align">
              <div className="player-title-ref">{track?.title || "Judul Lagu"}</div>
              <button type="button" className="player-artist-button" onClick={onArtistClick}>
                <div className="player-artist-ref">{track?.artist || "Artis"}</div>
              </button>
            </div>
          </div>

          <div className="progress-container-ref">
            <input
              type="range"
              className="progress-bar-ref music-range"
              value={Math.min(currentTime, duration || track?.duration || 0)}
              min={0}
              max={duration || track?.duration || 0}
              step={0.1}
              onChange={(event) => onSeek(Number(event.target.value))}
              style={{ ["--range-progress" as string]: `${progress}%` }}
            />
            <div className="time-info-ref">
              <span>{formatTime(currentTime)}</span>
              <span>{loadingStream ? "Memuat..." : `-${formatTime(Math.max((duration || track?.duration || 0) - currentTime, 0))}`}</span>
            </div>
          </div>

          <div className="playback-controls-ref">
            <button
              type="button"
              className={`ghost-player-btn small ${shuffle ? "active" : ""}`}
              onClick={onToggleShuffle}
              aria-label="Shuffle"
            >
              <ShuffleIcon className="icon-22" />
            </button>
            <button type="button" className="ghost-player-btn" onClick={onPrev}><PrevIcon /></button>
            <button type="button" className="play-pause-btn-ref" onClick={onTogglePlay}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
            <button type="button" className="ghost-player-btn" onClick={onNext}><NextIcon /></button>
            <button
              type="button"
              className={`ghost-player-btn small ${repeat !== "off" ? "active" : ""}`}
              onClick={onCycleRepeat}
              aria-label={`Repeat ${repeat}`}
            >
              <RepeatIcon className="icon-22" mode={repeat} />
            </button>
          </div>

          <div className="player-quick-row">
            <button type="button" className="pill-soft" onClick={onOpenQueue}>
              <QueueIcon className="icon-18" />
              <span>Queue{queueCount > 0 ? ` (${queueCount})` : ""}</span>
            </button>
            <button type="button" className="pill-soft" onClick={onOpenLyrics}>
              <LyricsIcon className="icon-18" />
              <span>Lirik</span>
            </button>
            <button type="button" className="pill-soft" onClick={onOpenPlaylist}>
              <PlusIcon className="icon-18" />
              <span>Playlist</span>
            </button>
            <button type="button" className="pill-soft" onClick={onOpenSleep}>
              <ClockIcon className="icon-18" />
              <span>{sleepRemainingMs > 0 ? "Timer aktif" : "Sleep"}</span>
            </button>
          </div>

          <div className="volume-row-ref">
            <SpeakerLowIcon />
            <input
              type="range"
              className="music-range"
              value={volume}
              min={0}
              max={100}
              onChange={(event) => onVolume(Number(event.target.value))}
              style={{ ["--range-progress" as string]: `${volume}%` }}
            />
            <SpeakerHighIcon />
          </div>

          <div className="airplay-pill-wrap">
            <div className="airplay-pill">
              <BrandNoteIcon />
              <span>Music</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const lyricsListRef = useRef<HTMLDivElement | null>(null);
  const lyricRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const sleepTimerRef = useRef<number | null>(null);
  const volumePersistRef = useRef(0);

  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [returnView, setReturnView] = useState<MainView>("home");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [playlistSheetOpen, setPlaylistSheetOpen] = useState(false);

  const [homeSections, setHomeSections] = useState<FeedSection[]>([]);
  const [albumRows, setAlbumRows] = useState<PipedCollection[]>([]);
  const [playlistRows, setPlaylistRows] = useState<PipedCollection[]>([]);
  const [artistRows, setArtistRows] = useState<PipedArtist[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<SearchBundle>({ tracks: [], albums: [], playlists: [], artists: [] });
  const [searchHistory, setSearchHistory] = useState<string[]>(() => readStorage<string[]>(STORAGE_KEYS.searchHistory, []));
  const [artistDetail, setArtistDetail] = useState<ArtistDetail | null>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [isHomeLoading, setIsHomeLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [homeError, setHomeError] = useState("");
  const [searchMessage, setSearchMessage] = useState("");

  const [currentTrack, setCurrentTrack] = useState<PipedTrack | null>(null);
  const [activeQueue, setActiveQueue] = useState<PipedTrack[]>([]);
  const [manualQueue, setManualQueue] = useState<PipedTrack[]>(() => readStorage<PipedTrack[]>(STORAGE_KEYS.queue, []));
  const [queueTitle, setQueueTitle] = useState("Music");
  const [likedTracks, setLikedTracks] = useState<Record<string, boolean>>(() => readStorage<Record<string, boolean>>(STORAGE_KEYS.likes, {}));
  const [recentPlayed, setRecentPlayed] = useState<PipedTrack[]>(() => readStorage<PipedTrack[]>(STORAGE_KEYS.recent, []));
  const [playbackSource, setPlaybackSource] = useState<PlayableSource | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => readStorage<number>(STORAGE_KEYS.volume, 78));
  const [shuffle, setShuffle] = useState<boolean>(() => readStorage<boolean>(STORAGE_KEYS.shuffle, false));
  const [repeat, setRepeat] = useState<RepeatMode>(() => readStorage<RepeatMode>(STORAGE_KEYS.repeat, "off"));
  const [sleepRemainingMs, setSleepRemainingMs] = useState(0);
  const [stats, setStats] = useState<MusicStats>(() => readStorage<MusicStats>(STORAGE_KEYS.stats, EMPTY_STATS));
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>(() => readStorage<CustomPlaylist[]>(STORAGE_KEYS.playlists, []));
  const [audioError, setAudioError] = useState("");
  const [theme, setTheme] = useState<ThemeAccent | null>(null);

  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [syncedLyrics, setSyncedLyrics] = useState("");

  const { toasts, show: showToast } = useToast();

  const playerBackground = currentTrack?.artwork || recentPlayed[0]?.artwork || "/images/satriamusic-cover.jpg";
  const visibleLyrics = useMemo<LyricLine[]>(() => {
    const synced = parseLrc(syncedLyrics);
    if (synced.length > 0) return synced;
    return plainLyrics
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text, index) => ({ time: index * 4, text }));
  }, [plainLyrics, syncedLyrics]);
  const activeLyricIndex = useMemo(() => getActiveLyricIndex(visibleLyrics, currentTime), [visibleLyrics, currentTime]);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const masterQueue = useMemo(
    () => dedupeTracks([...recentPlayed, ...homeSections.flatMap((section) => section.tracks), ...searchResults.tracks]),
    [homeSections, recentPlayed, searchResults.tracks],
  );

  const likedList = useMemo(() => masterQueue.filter((track) => likedTracks[track.id]), [likedTracks, masterQueue]);
  const recentList = recentPlayed.length > 0 ? recentPlayed.slice(0, 6) : homeSections[0]?.tracks.slice(0, 6) || [];
  const derivedStats = useMemo(() => deriveStats(stats), [stats]);

  // Persistence effects
  useEffect(() => { writeStorage(STORAGE_KEYS.likes, likedTracks); }, [likedTracks]);
  useEffect(() => { writeStorage(STORAGE_KEYS.recent, recentPlayed.slice(0, RECENT_LIMIT)); }, [recentPlayed]);
  useEffect(() => { writeStorage(STORAGE_KEYS.queue, manualQueue); }, [manualQueue]);
  useEffect(() => { writeStorage(STORAGE_KEYS.shuffle, shuffle); }, [shuffle]);
  useEffect(() => { writeStorage(STORAGE_KEYS.repeat, repeat); }, [repeat]);
  useEffect(() => { writeStorage(STORAGE_KEYS.searchHistory, searchHistory); }, [searchHistory]);
  useEffect(() => { writeStorage(STORAGE_KEYS.playlists, playlists); }, [playlists]);
  useEffect(() => { writeStorage(STORAGE_KEYS.stats, stats); }, [stats]);
  useEffect(() => {
    if (volumePersistRef.current) window.clearTimeout(volumePersistRef.current);
    volumePersistRef.current = window.setTimeout(() => writeStorage(STORAGE_KEYS.volume, volume), 400);
    return () => {
      if (volumePersistRef.current) window.clearTimeout(volumePersistRef.current);
    };
  }, [volume]);

  // Home data load
  useEffect(() => {
    let cancelled = false;
    const loadHome = async () => {
      setIsHomeLoading(true);
      setHomeError("");
      try {
        const [anyar, gembira, charts, galau, tiktok, hits, globalPop, albums, playlistsRes, artistsMain, artistsIndo, artistsGlobal] = await Promise.all([
          searchTracks("baru rilis indonesia official audio"),
          searchTracks("lagu semangat indonesia official audio"),
          getTrendingTracks("ID"),
          searchTracks("lagu galau indonesia official audio"),
          searchTracks("viral tiktok indonesia official audio"),
          searchTracks("top hits indonesia official audio"),
          searchTracks("Justin Bieber Billie Eilish Bruno Mars Taylor Swift Multo official songs"),
          searchAlbums("Hindia"),
          searchPlaylists("This is Hindia"),
          searchArtists("Hindia Justin Bieber Billie Eilish Multo"),
          searchArtists("Hindia Tulus Sheila On 7 Pamungkas Nadin Amizah Kunto Aji"),
          searchArtists("Justin Bieber Billie Eilish Bruno Mars Taylor Swift Olivia Rodrigo The Weeknd"),
        ]);
        if (cancelled) return;
        const sections: FeedSection[] = [
          { id: "anyar", title: "Rilis Anyar (Baru Rilis)", tracks: filterHomeTracks(anyar).slice(0, 12) },
          { id: "gembira", title: "Gembira & Semangat", tracks: filterHomeTracks(gembira).slice(0, 12) },
          { id: "charts", title: "Tangga Lagu Populer", tracks: filterHomeTracks(charts).slice(0, 12) },
          { id: "global", title: "Global Pop Pilihan", tracks: filterHomeTracks(globalPop).slice(0, 12) },
          { id: "galau", title: "Galau Terpopuler", tracks: filterHomeTracks(galau).slice(0, 12) },
          { id: "tiktok", title: "Viral TikTok", tracks: filterHomeTracks(tiktok).slice(0, 12) },
          { id: "hits", title: "Hit terpopuler hari ini", tracks: filterHomeTracks(hits).slice(0, 12) },
        ].filter((section) => section.tracks.length > 0);
        setHomeSections(sections);

        const mergedArtists = new Map<string, PipedArtist>();
        [...artistsIndo, ...artistsGlobal, ...artistsMain].forEach((artist) => {
          if (!mergedArtists.has(artist.name.toLowerCase())) mergedArtists.set(artist.name.toLowerCase(), artist);
        });
        setAlbumRows(albums.slice(0, 10));
        setPlaylistRows(playlistsRes.slice(0, 10));
        setArtistRows(Array.from(mergedArtists.values()).slice(0, 14));

        const fallbackTrack = sections[0]?.tracks[0] || null;
        if (fallbackTrack) {
          setCurrentTrack((prev) => prev ?? fallbackTrack);
          setDuration((prev) => prev || fallbackTrack.duration || 0);
        }
      } catch (error) {
        if (cancelled) return;
        setHomeError(error instanceof Error ? error.message : "Gagal memuat home.");
      } finally {
        if (!cancelled) setIsHomeLoading(false);
      }
    };
    void loadHome();
    return () => { cancelled = true; };
  }, []);

  // Search suggestions (debounced)
  useEffect(() => {
    if (!searchInput.trim()) { setSearchSuggestions([]); return; }
    const timeoutId = window.setTimeout(() => {
      void getSearchSuggestions(searchInput).then(setSearchSuggestions).catch(() => setSearchSuggestions([]));
    }, SEARCH_DEBOUNCE);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  // Playback source
  useEffect(() => {
    if (!currentTrack) { setPlaybackSource(null); return; }
    let cancelled = false;
    setLoadingStream(true);
    setAudioError("");
    setPlaybackSource({ src: currentTrack.youtubeUrl, mode: "youtube" });
    setDuration(currentTrack.duration || 0);
    void getTrackPlaybackSource(currentTrack.videoId)
      .then((source) => {
        if (cancelled) return;
        setPlaybackSource(source);
        if (source.duration) setDuration(source.duration);
      })
      .catch(() => {
        if (cancelled) return;
        setPlaybackSource({ src: currentTrack.youtubeUrl, mode: "youtube" });
      })
      .finally(() => { if (!cancelled) setLoadingStream(false); });
    return () => { cancelled = true; };
  }, [currentTrack?.id]);

  // Lyrics
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentTrack) return;
      setLyricsLoading(true);
      try {
        const result = await getLyrics(cleanForLyrics(currentTrack.title), cleanForLyrics(currentTrack.artist));
        if (cancelled) return;
        setPlainLyrics(result.plain);
        setSyncedLyrics(result.synced);
      } catch {
        if (cancelled) return;
        setPlainLyrics("");
        setSyncedLyrics("");
      } finally {
        if (!cancelled) setLyricsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [currentTrack?.id]);

  // Auto-scroll lyrics in mini player
  useEffect(() => {
    const container = lyricsListRef.current;
    const activeLine = lyricRefs.current[activeLyricIndex];
    if (!container || !activeLine || activeLyricIndex < 0) return;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const lineTop = activeLine.offsetTop;
    const lineBottom = lineTop + activeLine.clientHeight;
    if (lineTop < containerTop + 24 || lineBottom > containerBottom - 24) {
      container.scrollTo({ top: Math.max(lineTop - container.clientHeight / 2 + activeLine.clientHeight, 0), behavior: "smooth" });
    }
  }, [activeLyricIndex]);

  useEffect(() => { if (!playerOpen) setPlayerMenuOpen(false); }, [playerOpen, currentTrack?.id]);

  // Dynamic theme
  useEffect(() => {
    if (!currentTrack?.artwork) { setTheme(null); return; }
    let cancelled = false;
    void extractThemeFromImage(currentTrack.artwork).then((result) => { if (!cancelled) setTheme(result); });
    return () => { cancelled = true; };
  }, [currentTrack?.artwork]);

  // Stats tracking
  const statsTrackRef = useRef<{ id: string; accumulated: number } | null>(null);
  useEffect(() => {
    statsTrackRef.current = currentTrack ? { id: currentTrack.id, accumulated: 0 } : null;
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!currentTrack || !isPlaying) return;
    const id = window.setInterval(() => {
      const state = statsTrackRef.current;
      if (!state || state.id !== currentTrack.id) return;
      state.accumulated += 1000;
      setStats((prev) => ({ ...prev, totalListeningMs: prev.totalListeningMs + 1000 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [currentTrack?.id, isPlaying]);

  // Media Session
  useMediaSession(
    currentTrack ? { title: currentTrack.title, artist: currentTrack.artist, artwork: currentTrack.artwork } : null,
    isPlaying,
    {
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onPrev: () => handlePrevious(),
      onNext: () => handleNext(),
    },
  );

  // Sleep timer
  useEffect(() => {
    if (sleepRemainingMs <= 0) return;
    const interval = window.setInterval(() => {
      setSleepRemainingMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          setIsPlaying(false);
          showToast("Sleep timer selesai. Audio dihentikan.");
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [sleepRemainingMs > 0, showToast]);

  // Keyboard shortcut for spacebar when player open
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.code === "Space" && playerOpen) {
        event.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerOpen]);

  const openTrack = (track: PipedTrack, queue: PipedTrack[], title: string) => {
    if (currentTrack?.id === track.id) {
      setPlayerOpen(true);
      setIsPlaying(true);
      return;
    }
    setCurrentTrack(track);
    setActiveQueue(queue);
    setQueueTitle(title);
    setCurrentTime(0);
    setDuration(track.duration || 0);
    setIsPlaying(true);
    setPlayerOpen(true);
    setRecentPlayed((previous) => dedupeTracks([track, ...previous]).slice(0, RECENT_LIMIT));
    setStats((previous) => ({
      ...previous,
      totalPlayed: previous.totalPlayed + 1,
      events: [
        {
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          artwork: track.artwork,
          duration: track.duration,
          playedAt: Date.now(),
        },
        ...previous.events,
      ].slice(0, 500),
    }));
  };

  const handleToggleLike = (track: PipedTrack) => {
    setLikedTracks((previous) => {
      const next = { ...previous, [track.id]: !previous[track.id] };
      showToast(next[track.id] ? "Ditambahkan ke Liked Songs." : "Dihapus dari Liked Songs.");
      return next;
    });
  };

  const handleAddToQueue = (track: PipedTrack) => {
    setManualQueue((previous) => {
      if (previous.some((item) => item.id === track.id)) {
        showToast("Lagu sudah ada di queue.");
        return previous;
      }
      showToast("Ditambahkan ke queue.");
      return [...previous, track];
    });
  };

  const handlePlayNext = (track: PipedTrack) => {
    setManualQueue((previous) => [track, ...previous.filter((item) => item.id !== track.id)]);
    showToast("Akan diputar berikutnya.");
  };

  const handleRemoveFromQueue = (trackId: string) => {
    setManualQueue((previous) => previous.filter((item) => item.id !== trackId));
  };

  const handleMoveInQueue = (from: number, to: number) => {
    setManualQueue((previous) => {
      if (from < 0 || to < 0 || from >= previous.length || to >= previous.length) return previous;
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSearch = useCallback(async (query = searchInput) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setActiveView("search");
    setIsSearchLoading(true);
    setSearchMessage("Mencari lagu, album, playlist, dan artist...");
    setSearchHistory((previous) => [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, SEARCH_HISTORY_LIMIT));
    try {
      const [tracks, albums, playlistsRes, artists] = await Promise.all([
        searchTracks(trimmed),
        searchAlbums(trimmed),
        searchPlaylists(trimmed),
        searchArtists(trimmed),
      ]);
      setSearchResults({ tracks, albums, playlists: playlistsRes, artists });
      setSearchMessage(`Hasil untuk "${trimmed}". Klik lagu untuk memutar.`);
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Pencarian gagal.");
    } finally {
      setIsSearchLoading(false);
      setSearchSuggestions([]);
    }
  }, [searchInput]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSearch();
  };

  const openCollection = async (item: PipedCollection) => {
    try {
      const detail = await getPlaylistTracks(item.id);
      setActiveView("search");
      setSearchResults((previous) => ({ ...previous, tracks: detail.tracks }));
      setSearchMessage(`Membuka ${item.type} "${detail.title}". Klik lagu untuk memutar.`);
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Gagal membuka collection.");
    }
  };

  const openArtist = async (artist: PipedArtist) => {
    setReturnView(activeView === "artist" ? "home" : (activeView as MainView));
    setActiveView("artist");
    setArtistLoading(true);
    setArtistDetail({ artist, tracks: [], albums: [], playlists: [] });
    try {
      const [artistMatches, tracks, albums, playlistsRes] = await Promise.all([
        searchArtists(artist.name),
        searchTracks(`${artist.name} official songs`),
        searchAlbums(artist.name),
        searchPlaylists(artist.name),
      ]);
      const resolvedArtist = chooseBestArtistMatch(artist.name, artistMatches) ?? artist;
      const filteredTracks = tracks.filter((item) => isTrackFromArtist(item, resolvedArtist.name));
      const filteredAlbums = albums.filter((item) => isCollectionFromArtist(item, resolvedArtist.name));
      const filteredPlaylists = playlistsRes.filter((item) => isCollectionFromArtist(item, resolvedArtist.name));
      setArtistDetail({
        artist: resolvedArtist,
        tracks: (filteredTracks.length > 0 ? filteredTracks : tracks).slice(0, 12),
        albums: (filteredAlbums.length > 0 ? filteredAlbums : albums).slice(0, 10),
        playlists: (filteredPlaylists.length > 0 ? filteredPlaylists : playlistsRes).slice(0, 10),
      });
    } finally {
      setArtistLoading(false);
    }
  };

  const combinedQueue = useMemo(() => {
    if (manualQueue.length === 0) return activeQueue;
    return dedupeTracks([...activeQueue, ...manualQueue]);
  }, [activeQueue, manualQueue]);

  const pickRandomIndex = (length: number, currentIndex: number) => {
    if (length <= 1) return 0;
    let next = currentIndex;
    while (next === currentIndex) next = Math.floor(Math.random() * length);
    return next;
  };

  const advanceTrack = (direction: 1 | -1) => {
    const sourceQueue = combinedQueue.length > 1 ? combinedQueue : masterQueue;
    if (sourceQueue.length === 0) return;
    const currentIndex = sourceQueue.findIndex((item) => item.id === currentTrack?.id);

    let nextIndex: number;

    if (shuffle) {
      nextIndex = pickRandomIndex(sourceQueue.length, currentIndex);
    } else if (currentIndex === -1) {
      nextIndex = 0;
    } else if (direction === 1) {
      nextIndex = (currentIndex + 1) % sourceQueue.length;
    } else {
      nextIndex = currentIndex <= 0 ? sourceQueue.length - 1 : currentIndex - 1;
    }

    openTrack(sourceQueue[nextIndex], sourceQueue === activeQueue ? activeQueue : sourceQueue, sourceQueue === activeQueue ? queueTitle : "Music Mix");
  };

  const handleNext = () => advanceTrack(1);
  const handlePrevious = () => advanceTrack(-1);

  const handleEnded = () => {
    if (repeat === "one" && currentTrack) {
      if (playerRef.current) {
        playerRef.current.currentTime = 0;
        void playerRef.current.play().catch(() => setIsPlaying(false));
      }
      return;
    }
    if (repeat === "off" && !shuffle) {
      const sourceQueue = combinedQueue.length > 1 ? combinedQueue : masterQueue;
      const currentIndex = sourceQueue.findIndex((item) => item.id === currentTrack?.id);
      if (currentIndex >= sourceQueue.length - 1) {
        setIsPlaying(false);
        return;
      }
    }
    handleNext();
  };

  const handleTogglePlay = () => {
    if (!currentTrack) {
      const fallback = recentList[0] || homeSections[0]?.tracks[0];
      if (fallback) {
        openTrack(fallback, recentList.length > 0 ? recentList : homeSections[0].tracks, "Sering kamu dengarkan");
      }
      return;
    }
    setIsPlaying((prev) => !prev);
  };

  const handleSeek = (value: number) => {
    if (playerRef.current) playerRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const handleCycleRepeat = () => {
    setRepeat((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"));
  };

  const handleSleepSelect = (minutes: number) => {
    setSleepRemainingMs(minutes * 60 * 1000);
    setSleepOpen(false);
    showToast(`Sleep timer disetel ${minutes} menit.`);
  };

  const handleSleepCancel = () => {
    setSleepRemainingMs(0);
    showToast("Sleep timer dibatalkan.");
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    showToast("Riwayat pencarian dihapus.");
  };

  const clearRecent = () => {
    setRecentPlayed([]);
    showToast("Riwayat terakhir diputar dihapus.");
  };

  const clearStats = () => {
    setStats(EMPTY_STATS);
    showToast("Statistik direset.");
  };

  const handleCreatePlaylist = (name: string) => {
    const item: CustomPlaylist = { id: `pl-${Date.now()}`, name, tracks: [], createdAt: Date.now() };
    setPlaylists((prev) => [item, ...prev]);
    showToast(`Playlist "${name}" dibuat.`);
  };

  const handleRenamePlaylist = (id: string, name: string) => {
    setPlaylists((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)));
    showToast("Playlist diubah nama.");
  };

  const handleDeletePlaylist = (id: string) => {
    setPlaylists((prev) => prev.filter((item) => item.id !== id));
    showToast("Playlist dihapus.");
  };

  const handleAddToPlaylist = (playlistId: string, track: PipedTrack) => {
    setPlaylists((prev) =>
      prev.map((item) =>
        item.id === playlistId && !item.tracks.some((t) => t.id === track.id)
          ? { ...item, tracks: [...item.tracks, track] }
          : item,
      ),
    );
    showToast("Lagu ditambahkan ke playlist.");
  };

  const handleRemoveFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) => prev.map((item) => (item.id === playlistId ? { ...item, tracks: item.tracks.filter((t) => t.id !== trackId) } : item)));
    showToast("Lagu dihapus dari playlist.");
  };

  const handlePlayCustomPlaylist = (playlist: CustomPlaylist) => {
    if (playlist.tracks.length === 0) return;
    openTrack(playlist.tracks[0], playlist.tracks, playlist.name);
  };

  return (
    <>
      <div className="app-bg" style={{ backgroundImage: `url(${playerBackground})` }}></div>
      <div className="theme-glow" style={{ background: theme?.accentSoft || "transparent" }} aria-hidden="true" />

      <main className="app-shell">
        <section id="view-home" className={`view-section ${activeView === "home" ? "active" : ""}`}>
          <div className="home-header no-avatar-header">
            <div className="pill active">Semua</div>
            <div className="pill">Musik</div>
            <div className="pill">Podcast</div>
          </div>

          <div className="section-container">
            <h2 className="section-title">Sering kamu dengarkan</h2>
            {recentList.length > 0 ? (
              <div className="vertical-list" id="recentList">
                {recentList.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    active={currentTrack?.id === track.id}
                    liked={Boolean(likedTracks[track.id])}
                    onClick={() => openTrack(track, recentList, track.title)}
                    onArtistClick={() => void openArtist(artistFromTrack(track))}
                    onLike={() => handleToggleLike(track)}
                    onAddToQueue={() => handleAddToQueue(track)}
                    right={<span className="play-badge">▶</span>}
                  />
                ))}
              </div>
            ) : isHomeLoading ? (
              <SkeletonRecentList />
            ) : (
              <div className="vertical-list"><div className="empty-copy">Belum ada lagu di daftar ini.</div></div>
            )}
          </div>

          {homeError ? <div className="section-container"><div className="empty-copy">{homeError}</div></div> : null}

          {isHomeLoading && homeSections.length === 0 ? (
            <>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="section-container">
                  <h2 className="section-title">Memuat katalog...</h2>
                  <SkeletonHorizontalRow />
                </div>
              ))}
            </>
          ) : (
            <>
              {homeSections.map((section) => (
                <div key={section.id} className="section-container">
                  <h2 className="section-title">{section.title}</h2>
                  <div className="horizontal-scroll">
                    {section.tracks.map((track) => (
                      <HorizontalTrackCard
                        key={track.id}
                        track={track}
                        onClick={() => openTrack(track, section.tracks, track.title)}
                        onArtistClick={() => void openArtist(artistFromTrack(track))}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {recentPlayed.length > 0 && (
                <div className="section-container">
                  <div className="section-title-row">
                    <h2 className="section-title">Recently Played</h2>
                    <button type="button" className="pill-soft small" onClick={clearRecent}>
                      <TrashIcon className="icon-16" />
                      <span>Bersihkan</span>
                    </button>
                  </div>
                  <div className="vertical-list">
                    {recentPlayed.slice(0, 6).map((track) => (
                      <TrackRow
                        key={`home-recent-${track.id}`}
                        track={track}
                        liked={Boolean(likedTracks[track.id])}
                        active={currentTrack?.id === track.id}
                        onClick={() => openTrack(track, recentPlayed, track.title)}
                        onArtistClick={() => void openArtist(artistFromTrack(track))}
                        onLike={() => handleToggleLike(track)}
                        onAddToQueue={() => handleAddToQueue(track)}
                        right={<span className="play-badge">▶</span>}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="section-container">
                <h2 className="section-title">Album dan single populer</h2>
                <div className="horizontal-scroll">
                  {albumRows.map((item) => (
                    <HorizontalCollectionCard key={item.id} item={item} onClick={() => void openCollection(item)} />
                  ))}
                </div>
              </div>

              <div className="section-container">
                <h2 className="section-title">Artis Terpopuler Saat Ini</h2>
                <div className="horizontal-scroll">
                  {artistRows.map((artist) => (
                    <HorizontalArtistCard key={artist.id} artist={artist} onClick={() => void openArtist(artist)} />
                  ))}
                </div>
              </div>

              <div className="section-container">
                <h2 className="section-title">Playlist populer</h2>
                <div className="horizontal-scroll">
                  {playlistRows.map((item) => (
                    <HorizontalCollectionCard key={item.id} item={item} onClick={() => void openCollection(item)} />
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        <section id="view-search" className={`view-section ${activeView === "search" ? "active" : ""}`}>
          <div className="search-header-container no-avatar-header">
            <h1>Cari</h1>
          </div>

          <form onSubmit={handleSubmit} className="search-box-wrapper">
            <div className="search-icon-input"><SearchIcon /></div>
            <input
              type="text"
              className="search-box"
              placeholder="Apa yang ingin kamu dengarkan?"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {searchInput && (
              <button type="button" className="search-clear-btn" onClick={() => setSearchInput("")} aria-label="Hapus input">
                <XIcon className="icon-16" />
              </button>
            )}
          </form>

          <div className="quick-search-row">
            {QUICK_SEARCHES.map((item) => (
              <button
                key={item}
                type="button"
                className="pill"
                onClick={() => { setSearchInput(item); void handleSearch(item); }}
              >
                {item}
              </button>
            ))}
          </div>

          {searchHistory.length > 0 && !searchInput && (
            <div className="section-container">
              <div className="section-title-row">
                <h2 className="section-title">Pencarian terakhir</h2>
                <button type="button" className="pill-soft small" onClick={clearSearchHistory}>
                  <TrashIcon className="icon-16" />
                  <span>Hapus</span>
                </button>
              </div>
              <div className="history-chip-row">
                {searchHistory.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="history-chip"
                    onClick={() => { setSearchInput(item); void handleSearch(item); }}
                  >
                    <SearchIcon />
                    <span>{item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchSuggestions.length > 0 && (
            <div className="section-container">
              <div className="vertical-list">
                {searchSuggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="search-suggestion"
                    onClick={() => { setSearchInput(item); void handleSearch(item); }}
                  >
                    <SearchIcon />
                    <span>{item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchResults.tracks.length === 0 && searchResults.artists.length === 0 && !isSearchLoading ? (
            <div id="searchCategoriesUI">
              <h2 className="section-title">Jelajahi semua</h2>
              <div className="category-grid">
                {searchCategories.map((category) => (
                  <button
                    key={category.title}
                    type="button"
                    className="category-card"
                    style={{ backgroundColor: category.color }}
                    onClick={() => { setSearchInput(category.title); void handleSearch(category.title); }}
                  >
                    <div className="category-title">{category.title}</div>
                    <img className="category-img" src={category.image} alt={category.title} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div id="searchResultsUI">
              <h2 className="section-title">{isSearchLoading ? "Memuat hasil..." : searchMessage || "Hasil pencarian"}</h2>
              {isSearchLoading ? (
                <>
                  <SkeletonRecentList />
                  <div className="section-container">
                    <h2 className="section-title">Artist</h2>
                    <SkeletonHorizontalRow />
                  </div>
                </>
              ) : (
                <>
                  <div className="vertical-list">
                    {searchResults.tracks.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        active={currentTrack?.id === track.id}
                        liked={Boolean(likedTracks[track.id])}
                        onClick={() => openTrack(track, searchResults.tracks, track.title)}
                        onArtistClick={() => void openArtist(artistFromTrack(track))}
                        onLike={() => handleToggleLike(track)}
                        onAddToQueue={() => handleAddToQueue(track)}
                        right={<span className="play-badge">▶</span>}
                      />
                    ))}
                  </div>

                  {searchResults.artists.length > 0 && (
                    <div className="section-container">
                      <h2 className="section-title">Artist</h2>
                      <div className="horizontal-scroll">
                        {searchResults.artists.map((artist) => (
                          <HorizontalArtistCard key={artist.id} artist={artist} onClick={() => void openArtist(artist)} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <section id="view-library" className={`view-section ${activeView === "library" ? "active" : ""}`}>
          <div className="lib-header no-avatar-header">
            <div className="lib-header-left">
              <h1 className="lib-title">Koleksi Kamu</h1>
            </div>
            <button type="button" className="icon-ghost-btn" onClick={() => setStatsOpen(true)} aria-label="Statistik">
              <ClockIcon className="icon-20" />
            </button>
          </div>

          <div className="lib-filters">
            <div className="pill active">Disukai</div>
            <div className="pill">Terakhir</div>
            <div className="pill">Playlist</div>
          </div>

          <div className="section-container">
            <div className="section-title-row">
              <h2 className="section-title">Liked Songs</h2>
              {likedList.length > 0 && (
                <button
                  type="button"
                  className="pill-soft small"
                  onClick={() => openTrack(likedList[0], likedList, "Liked Songs")}
                >
                  <PlayIcon />
                  <span>Putar</span>
                </button>
              )}
            </div>
            <div className="lib-list" id="libraryFavorites">
              {likedList.map((track) => (
                <button key={track.id} type="button" className="lib-item" onClick={() => openTrack(track, likedList, "Liked Songs")}>
                  <img className="lib-item-img" src={track.artwork} alt={track.title} loading="lazy" />
                  <div className="lib-item-info">
                    <div className="lib-item-title">{track.title}</div>
                    <div className="lib-item-sub">{track.artist}</div>
                  </div>
                </button>
              ))}
              {likedList.length === 0 && <div className="empty-copy">Belum ada lagu favorit di koleksi kamu.</div>}
            </div>
          </div>

          <div className="section-container">
            <div className="section-title-row">
              <h2 className="section-title">Custom Playlist</h2>
              <button
                type="button"
                className="pill-soft small"
                onClick={() => { setPlaylistSheetOpen(true); }}
              >
                <PlusIcon className="icon-16" />
                <span>Buat</span>
              </button>
            </div>
            <div className="lib-list">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  className="lib-item"
                  onClick={() => playlist.tracks.length > 0 && openTrack(playlist.tracks[0], playlist.tracks, playlist.name)}
                >
                  <div className="playlist-lib-thumb">
                    <FolderIcon className="icon-24" />
                  </div>
                  <div className="lib-item-info">
                    <div className="lib-item-title">{playlist.name}</div>
                    <div className="lib-item-sub">{playlist.tracks.length} lagu</div>
                  </div>
                </button>
              ))}
              {playlists.length === 0 && <div className="empty-copy">Belum ada playlist. Tekan "Buat" untuk memulai.</div>}
            </div>
          </div>

          <div className="section-container">
            <div className="section-title-row">
              <h2 className="section-title">Terakhir</h2>
              {recentPlayed.length > 0 && (
                <button type="button" className="pill-soft small" onClick={clearRecent}>
                  <TrashIcon className="icon-16" />
                  <span>Bersihkan</span>
                </button>
              )}
            </div>
            <div className="lib-list" id="libraryRecent">
              {recentPlayed.slice(0, RECENT_LIMIT).map((track) => (
                <button key={`recent-${track.id}`} type="button" className="lib-item" onClick={() => openTrack(track, recentPlayed, track.title)}>
                  <img className="lib-item-img" src={track.artwork} alt={track.title} loading="lazy" />
                  <div className="lib-item-info">
                    <div className="lib-item-title">{track.title}</div>
                    <div className="lib-item-sub">Baru diputar • {track.artist}</div>
                  </div>
                </button>
              ))}
              {recentPlayed.length === 0 && <div className="empty-copy">Belum ada lagu terakhir diputar.</div>}
            </div>
          </div>
        </section>

        <section id="view-artist" className={`view-section ${activeView === "artist" ? "active" : ""}`}>
          {artistLoading ? (
            <SkeletonArtistProfile />
          ) : (
            <>
              <div className="artist-hero">
                <button type="button" className="back-btn" onClick={() => setActiveView(returnView)}>‹</button>
                <div className="artist-hero-meta">
                  <img className="artist-hero-img" src={artistDetail?.artist.artwork || "/images/satriamusic-cover.jpg"} alt={artistDetail?.artist.name || "artist"} />
                  <div>
                    <p className="artist-eyebrow">Profil artis</p>
                    <h1 id="artistNameDisplay">{artistDetail?.artist.name || "Nama Artis"}</h1>
                    <p className="artist-subtext">{artistDetail?.artist.subscribersText || "Artis terpilih"}</p>
                  </div>
                </div>
              </div>

              <div className="artist-actions-row">
                <button type="button" className="artist-play-btn" onClick={() => artistDetail?.tracks[0] && openTrack(artistDetail.tracks[0], artistDetail.tracks, artistDetail.artist.name)}>
                  <PlayIcon />
                </button>
              </div>

              <div className="section-container">
                <h2 className="section-title">Populer</h2>
                <div className="vertical-list">
                  {artistDetail?.tracks.map((track) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      active={currentTrack?.id === track.id}
                      liked={Boolean(likedTracks[track.id])}
                      onClick={() => openTrack(track, artistDetail.tracks, artistDetail.artist.name)}
                      onArtistClick={() => void openArtist(artistFromTrack(track))}
                      onLike={() => handleToggleLike(track)}
                      onAddToQueue={() => handleAddToQueue(track)}
                      right={<span className="play-badge">▶</span>}
                    />
                  ))}
                  {!artistDetail || artistDetail.tracks.length === 0 ? <div className="empty-copy">Belum ada lagu populer untuk artis ini.</div> : null}
                </div>
              </div>

              {artistDetail?.albums.length ? (
                <div className="section-container">
                  <h2 className="section-title">Album</h2>
                  <div className="horizontal-scroll">
                    {artistDetail.albums.map((item) => (
                      <HorizontalCollectionCard key={item.id} item={item} onClick={() => void openCollection(item)} />
                    ))}
                  </div>
                </div>
              ) : null}

              {artistDetail?.playlists.length ? (
                <div className="section-container">
                  <h2 className="section-title">Playlist</h2>
                  <div className="horizontal-scroll">
                    {artistDetail.playlists.map((item) => (
                      <HorizontalCollectionCard key={item.id} item={item} onClick={() => void openCollection(item)} />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>

      {currentTrack && !playerOpen && (
        <div className="mini-player" onClick={() => setPlayerOpen(true)} role="button" tabIndex={0}>
          <img src={currentTrack.artwork} alt="Cover" />
          <div className="mini-player-info">
            <div className="mini-player-title">{currentTrack.title}</div>
            <div className="mini-player-artist">{currentTrack.artist}</div>
          </div>
          <div className="mini-player-controls" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="mini-icon-btn" onClick={() => handleToggleLike(currentTrack)}>
              <HeartIcon filled={likedTracks[currentTrack.id]} />
            </button>
            <button type="button" className="mini-icon-btn" onClick={handleTogglePlay}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button type="button" className="mini-icon-btn" onClick={handleNext}>
              <NextIcon />
            </button>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <button type="button" className={`nav-item ${activeView === "home" ? "active" : ""}`} onClick={() => setActiveView("home")}>
          <HomeIcon />
          <span>Home</span>
        </button>
        <button type="button" className={`nav-item ${activeView === "search" ? "active" : ""}`} onClick={() => setActiveView("search")}>
          <SearchIcon />
          <span>Cari</span>
        </button>
        <button type="button" className={`nav-item ${activeView === "library" ? "active" : ""}`} onClick={() => setActiveView("library")}>
          <LibraryIcon />
          <span>Koleksi Kamu</span>
        </button>
      </nav>

      <div id="playerModal" className={`modal-overlay ${playerOpen ? "open" : ""}`} style={{ ["--accent" as string]: theme?.accent || "#1ed760" }}>
        <div id="playerBg" style={{ backgroundImage: `url(${playerBackground})` }}></div>
        <div className="player-modal-grid">
          <div className="player-modal-primary">
            <PlayerCard
              track={currentTrack}
              playing={isPlaying}
              liked={currentTrack ? likedTracks[currentTrack.id] : false}
              progress={progress}
              currentTime={currentTime}
              duration={duration || currentTrack?.duration || 0}
              volume={volume}
              loadingStream={loadingStream}
              shuffle={shuffle}
              repeat={repeat}
              queueCount={manualQueue.length}
              sleepRemainingMs={sleepRemainingMs}
              onClose={() => setPlayerOpen(false)}
              onTogglePlay={handleTogglePlay}
              onPrev={handlePrevious}
              onNext={handleNext}
              onLike={() => currentTrack && handleToggleLike(currentTrack)}
              onMenu={() => setPlayerMenuOpen((prev) => !prev)}
              onArtistClick={() => currentTrack && void openArtist(artistFromTrack(currentTrack))}
              onSeek={handleSeek}
              onVolume={setVolume}
              onToggleShuffle={() => setShuffle((prev) => !prev)}
              onCycleRepeat={handleCycleRepeat}
              onOpenQueue={() => setQueueOpen(true)}
              onOpenLyrics={() => setFullscreenOpen(true)}
              onOpenSleep={() => setSleepOpen(true)}
              onOpenPlaylist={() => setPlaylistSheetOpen(true)}
            />

            {playerMenuOpen && currentTrack && (
              <div className="player-menu-sheet overlay">
                <button
                  type="button"
                  className="player-menu-item"
                  onClick={() => { handleToggleLike(currentTrack); setPlayerMenuOpen(false); }}
                >
                  {likedTracks[currentTrack.id] ? "Hapus dari Liked Songs" : "Tambahkan ke Liked Songs"}
                </button>
                <button
                  type="button"
                  className="player-menu-item"
                  onClick={() => { handleAddToQueue(currentTrack); setPlayerMenuOpen(false); }}
                >
                  Tambahkan ke Queue
                </button>
                <button
                  type="button"
                  className="player-menu-item"
                  onClick={() => { handlePlayNext(currentTrack); setPlayerMenuOpen(false); }}
                >
                  Putar berikutnya
                </button>
                <button
                  type="button"
                  className="player-menu-item"
                  onClick={() => { setPlaylistSheetOpen(true); setPlayerMenuOpen(false); }}
                >
                  Tambahkan ke Playlist
                </button>
                <button
                  type="button"
                  className="player-menu-item"
                  onClick={() => { setFullscreenOpen(true); setPlayerMenuOpen(false); }}
                >
                  Buka Fullscreen Player
                </button>
                <button
                  type="button"
                  className="player-menu-item"
                  onClick={() => { void openArtist(artistFromTrack(currentTrack)); setPlayerMenuOpen(false); }}
                >
                  Lihat Profil Artis
                </button>
              </div>
            )}
          </div>

          <div className="lyrics-panel-shell">
            <div className="lyrics-panel-header">
              <div>
                <div className="lyrics-eyebrow">Realtime lyrics</div>
                <h3 className="lyrics-title">{currentTrack?.title || "Tidak ada lagu aktif"}</h3>
                <p className="lyrics-subtitle">{lyricsLoading ? "Memuat lirik..." : visibleLyrics.length > 0 ? "Sinkron dengan lagu" : "Lirik belum tersedia"}</p>
              </div>
              <Equalizer active={isPlaying} />
            </div>

            <div className="lyrics-list" ref={lyricsListRef}>
              {visibleLyrics.length > 0 ? (
                visibleLyrics.map((line, index) => (
                  <p
                    key={`${line.time}-${index}`}
                    ref={(element) => { lyricRefs.current[index] = element; }}
                    className={`lyrics-line ${index === activeLyricIndex ? "active" : ""}`}
                    onClick={() => line.time >= 0 && handleSeek(line.time)}
                    role="button"
                    tabIndex={0}
                  >
                    {line.text}
                  </p>
                ))
              ) : (
                <div className="empty-copy">Putar lagu untuk melihat lyrics realtime di sini.</div>
              )}
            </div>

            <button type="button" className="primary-pill wide" onClick={() => setFullscreenOpen(true)}>
              <ExpandIcon className="icon-18" />
              <span>Buka lyrics fullscreen</span>
            </button>
          </div>
        </div>
      </div>

      <FullscreenPlayer
        open={fullscreenOpen}
        track={currentTrack}
        playing={isPlaying}
        liked={currentTrack ? Boolean(likedTracks[currentTrack.id]) : false}
        progress={progress}
        currentTime={currentTime}
        duration={duration || currentTrack?.duration || 0}
        loadingStream={loadingStream}
        lyricsLoading={lyricsLoading}
        plainLyrics={plainLyrics}
        syncedLyrics={syncedLyrics}
        shuffle={shuffle}
        repeat={repeat}
        onClose={() => setFullscreenOpen(false)}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrevious}
        onNext={handleNext}
        onToggleLike={() => currentTrack && handleToggleLike(currentTrack)}
        onSeek={handleSeek}
        onToggleShuffle={() => setShuffle((prev) => !prev)}
        onCycleRepeat={handleCycleRepeat}
        onOpenQueue={() => setQueueOpen(true)}
        onOpenSleep={() => setSleepOpen(true)}
        onOpenStats={() => setStatsOpen(true)}
        onArtistClick={() => currentTrack && void openArtist(artistFromTrack(currentTrack))}
        accent={theme?.accent || "#1ed760"}
      />

      <QueueSheet
        open={queueOpen}
        queue={combinedQueue}
        currentTrackId={currentTrack?.id}
        onClose={() => setQueueOpen(false)}
        onPlayIndex={(index) => {
          const track = combinedQueue[index];
          if (track) openTrack(track, combinedQueue, queueTitle);
          setQueueOpen(false);
        }}
        onRemove={handleRemoveFromQueue}
        onMove={handleMoveInQueue}
      />

      <SleepTimerSheet
        open={sleepOpen}
        remainingMs={sleepRemainingMs}
        onClose={() => setSleepOpen(false)}
        onSelect={handleSleepSelect}
        onCancel={handleSleepCancel}
      />

      <StatisticsSheet open={statsOpen} stats={derivedStats} onClose={() => setStatsOpen(false)} onClear={clearStats} />

      <PlaylistSheet
        open={playlistSheetOpen}
        playlists={playlists}
        track={currentTrack}
        onClose={() => setPlaylistSheetOpen(false)}
        onCreate={handleCreatePlaylist}
        onRename={handleRenamePlaylist}
        onDelete={handleDeletePlaylist}
        onAddTrack={handleAddToPlaylist}
        onRemoveTrack={handleRemoveFromPlaylist}
        onPlay={handlePlayCustomPlaylist}
      />

      <ToastStack toasts={toasts} />

      {audioError ? (
        <div className="audio-error-banner" role="alert">
          <span>{audioError}</span>
          <button type="button" className="icon-ghost-btn" onClick={() => setAudioError("")} aria-label="Tutup">
            <XIcon className="icon-16" />
          </button>
        </div>
      ) : null}

      <div className="hidden-player-host" aria-hidden="true">
        <ReactPlayer
          key={`${currentTrack?.id || "idle"}-${playbackSource?.mode || "none"}`}
          ref={playerRef}
          src={playbackSource?.src}
          playing={Boolean(currentTrack) && isPlaying}
          controls={false}
          playsInline
          width={1}
          height={1}
          volume={volume / 100}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={() => {
            setAudioError("Gagal memutar audio. Coba lagu lain atau periksa koneksi.");
            setIsPlaying(false);
          }}
          onEnded={handleEnded}
          onDurationChange={(event) => setDuration(event.currentTarget.duration || currentTrack?.duration || 0)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.time || 0)}
        />
      </div>
    </>
  );
      }
