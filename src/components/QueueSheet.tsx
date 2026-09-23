import type { PipedTrack } from "../utils/piped";
import { ArrowDownIcon, ArrowUpIcon, DragHandleIcon, TrashIcon, XIcon } from "./icons";

type Props = {
  open: boolean;
  queue: PipedTrack[];
  currentTrackId?: string;
  onClose: () => void;
  onPlayIndex: (index: number) => void;
  onRemove: (trackId: string) => void;
  onMove: (from: number, to: number) => void;
};

export function QueueSheet({ open, queue, currentTrackId, onClose, onPlayIndex, onRemove, onMove }: Props) {
  if (!open) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-header">
          <div className="sheet-title-group">
            <h3 className="sheet-title">Queue</h3>
            <p className="sheet-subtitle">{queue.length} lagu</p>
          </div>
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Tutup">
            <XIcon className="icon-20" />
          </button>
        </div>

        <div className="sheet-body">
          {queue.length === 0 ? (
            <div className="empty-copy">Queue masih kosong. Tambahkan lagu dari daftar.</div>
          ) : (
            queue.map((track, index) => (
              <div key={`${track.id}-${index}`} className={`queue-item ${track.id === currentTrackId ? "active" : ""}`}>
                <span className="queue-index"><DragHandleIcon className="icon-18" /></span>
                <button type="button" className="queue-cover-btn" onClick={() => onPlayIndex(index)}>
                  <img className="queue-cover" src={track.artwork} alt={track.title} loading="lazy" />
                </button>
                <button type="button" className="queue-copy" onClick={() => onPlayIndex(index)}>
                  <div className="queue-title">{track.title}</div>
                  <div className="queue-artist">{track.artist}</div>
                </button>
                <div className="queue-actions">
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    disabled={index === 0}
                    onClick={() => onMove(index, index - 1)}
                    aria-label="Naikkan"
                  >
                    <ArrowUpIcon className="icon-18" />
                  </button>
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    disabled={index === queue.length - 1}
                    onClick={() => onMove(index, index + 1)}
                    aria-label="Turunkan"
                  >
                    <ArrowDownIcon className="icon-18" />
                  </button>
                  <button
                    type="button"
                    className="icon-ghost-btn danger"
                    onClick={() => onRemove(track.id)}
                    aria-label="Hapus dari queue"
                  >
                    <TrashIcon className="icon-18" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
