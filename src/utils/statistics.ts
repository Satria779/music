export type PlayEvent = {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  playedAt: number;
};

export type MusicStats = {
  events: PlayEvent[];
  totalPlayed: number;
  totalListeningMs: number;
};

export const EMPTY_STATS: MusicStats = {
  events: [],
  totalPlayed: 0,
  totalListeningMs: 0,
};

export type DerivedStats = {
  totalSongs: number;
  totalListeningMs: number;
  topSongs: Array<{ trackId: string; title: string; artist: string; artwork: string; count: number }>;
  topArtists: Array<{ artist: string; count: number }>;
  recentlyPlayed: PlayEvent[];
};

export function deriveStats(stats: MusicStats): DerivedStats {
  const songMap = new Map<string, { title: string; artist: string; artwork: string; count: number }>();
  const artistMap = new Map<string, number>();

  stats.events.forEach((event) => {
    const existingSong = songMap.get(event.trackId);
    if (existingSong) {
      existingSong.count += 1;
    } else {
      songMap.set(event.trackId, {
        title: event.title,
        artist: event.artist,
        artwork: event.artwork,
        count: 1,
      });
    }

    if (event.artist) {
      artistMap.set(event.artist, (artistMap.get(event.artist) || 0) + 1);
    }
  });

  const topSongs = Array.from(songMap.entries())
    .map(([trackId, value]) => ({ trackId, ...value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topArtists = Array.from(artistMap.entries())
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const recentlyPlayed = [...stats.events].sort((a, b) => b.playedAt - a.playedAt).slice(0, 20);

  return {
    totalSongs: songMap.size,
    totalListeningMs: stats.totalListeningMs,
    topSongs,
    topArtists,
    recentlyPlayed,
  };
}
