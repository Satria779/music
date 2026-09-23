import type { DerivedStats } from "../utils/statistics";
import { XIcon, ChartIcon } from "./icons";

type Props = {
  open: boolean;
  stats: DerivedStats;
  onClose: () => void;
  onClear: () => void;
};

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

export function StatisticsSheet({ open, stats, onClose, onClear }: Props) {
  if (!open) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-header">
          <div className="sheet-title-group">
            <h3 className="sheet-title">Statistik</h3>
            <p className="sheet-subtitle">Dihitung dari aktivitas lokal kamu</p>
          </div>
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Tutup">
            <XIcon className="icon-20" />
          </button>
        </div>

        <div className="sheet-body">
          <div className="stats-grid">
            <div className="stats-card">
              <div className="stats-label">Total lagu</div>
              <div className="stats-value">{stats.totalSongs}</div>
            </div>
            <div className="stats-card">
              <div className="stats-label">Total mendengarkan</div>
              <div className="stats-value">{formatDuration(stats.totalListeningMs)}</div>
            </div>
          </div>

          <section className="stats-section">
            <header className="stats-section-header">
              <ChartIcon className="icon-18" />
              <span>Lagu paling sering</span>
            </header>
            {stats.topSongs.length === 0 ? (
              <div className="empty-copy">Belum ada data.</div>
            ) : (
              <ol className="stats-list">
                {stats.topSongs.map((song, index) => (
                  <li key={song.trackId} className="stats-item">
                    <span className="stats-rank">{index + 1}</span>
                    <img className="stats-thumb" src={song.artwork} alt={song.title} loading="lazy" />
                    <div className="stats-info">
                      <div className="stats-name">{song.title}</div>
                      <div className="stats-sub">{song.artist}</div>
                    </div>
                    <span className="stats-count">{song.count}x</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="stats-section">
            <header className="stats-section-header">
              <ChartIcon className="icon-18" />
              <span>Artis paling sering</span>
            </header>
            {stats.topArtists.length === 0 ? (
              <div className="empty-copy">Belum ada data.</div>
            ) : (
              <ol className="stats-list">
                {stats.topArtists.map((artist, index) => (
                  <li key={artist.artist} className="stats-item">
                    <span className="stats-rank">{index + 1}</span>
                    <div className="stats-info">
                      <div className="stats-name">{artist.artist}</div>
                    </div>
                    <span className="stats-count">{artist.count}x</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <button type="button" className="danger-pill" onClick={onClear}>
            Reset statistik
          </button>
        </div>
      </div>
    </div>
  );
            }
