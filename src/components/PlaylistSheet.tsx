import { useState } from "react";
import type { PipedTrack } from "../utils/piped";
import { XIcon, PlusIcon, TrashIcon, PencilIcon, FolderIcon, CheckIcon } from "./icons";

export type CustomPlaylist = {
  id: string;
  name: string;
  tracks: PipedTrack[];
  createdAt: number;
};

type Props = {
  open: boolean;
  playlists: CustomPlaylist[];
  track: PipedTrack | null;
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAddTrack: (playlistId: string, track: PipedTrack) => void;
  onRemoveTrack: (playlistId: string, trackId: string) => void;
  onPlay: (playlist: CustomPlaylist) => void;
};

export function PlaylistSheet({
  open,
  playlists,
  track,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onAddTrack,
  onRemoveTrack,
  onPlay,
}: Props) {
  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  if (!open) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-header">
          <div className="sheet-title-group">
            <h3 className="sheet-title">Playlist</h3>
            <p className="sheet-subtitle">
              {track ? `Kelola playlist untuk "${track.title}"` : "Kelola playlist kamu"}
            </p>
          </div>
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Tutup">
            <XIcon className="icon-20" />
          </button>
        </div>

        <div className="sheet-body">
          <div className="playlist-create-row">
            <input
              type="text"
              placeholder="Nama playlist baru"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="text-input"
            />
            <button
              type="button"
              className="primary-pill"
              onClick={() => {
                const trimmed = newName.trim();
                if (!trimmed) return;
                onCreate(trimmed);
                setNewName("");
              }}
            >
              <PlusIcon className="icon-18" />
              <span>Buat</span>
            </button>
          </div>

          {playlists.length === 0 ? (
            <div className="empty-copy">Belum ada playlist. Buat yang pertama.</div>
          ) : (
            <div className="playlist-list">
              {playlists.map((playlist) => {
                const isExpanded = expandedId === playlist.id;
                const isRenaming = renameId === playlist.id;
                const containsTrack = track ? playlist.tracks.some((item) => item.id === track.id) : false;

                return (
                  <div key={playlist.id} className="playlist-row">
                    <button
                      type="button"
                      className="playlist-main"
                      onClick={() => setExpandedId(isExpanded ? null : playlist.id)}
                    >
                      <span className="playlist-thumb">
                        <FolderIcon className="icon-20" />
                      </span>
                      <span className="playlist-copy">
                        <span className="playlist-name">{playlist.name}</span>
                        <span className="playlist-count">{playlist.tracks.length} lagu</span>
                      </span>
                    </button>

                    <div className="playlist-actions">
                      {track ? (
                        <button
                          type="button"
                          className={`icon-ghost-btn ${containsTrack ? "active" : ""}`}
                          onClick={() =>
                            containsTrack ? onRemoveTrack(playlist.id, track.id) : onAddTrack(playlist.id, track)
                          }
                          aria-label={containsTrack ? "Hapus dari playlist" : "Tambah ke playlist"}
                        >
                          <CheckIcon className="icon-18" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-ghost-btn"
                        onClick={() => {
                          setRenameId(playlist.id);
                          setRenameValue(playlist.name);
                        }}
                        aria-label="Ganti nama"
                      >
                        <PencilIcon className="icon-18" />
                      </button>
                      <button
                        type="button"
                        className="icon-ghost-btn danger"
                        onClick={() => onDelete(playlist.id)}
                        aria-label="Hapus playlist"
                      >
                        <TrashIcon className="icon-18" />
                      </button>
                    </div>

                    {isRenaming && (
                      <div className="playlist-rename-row">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          className="text-input"
                        />
                        <button
                          type="button"
                          className="primary-pill"
                          onClick={() => {
                            const trimmed = renameValue.trim();
                            if (trimmed) onRename(playlist.id, trimmed);
                            setRenameId(null);
                          }}
                        >
                          Simpan
                        </button>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="playlist-track-list">
                        {playlist.tracks.length === 0 ? (
                          <div className="empty-copy">Playlist ini masih kosong.</div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="primary-pill wide"
                              onClick={() => {
                                onPlay(playlist);
                                onClose();
                              }}
                            >
                              Putar playlist
                            </button>
                            {playlist.tracks.map((item) => (
                              <div key={item.id} className="playlist-track-row">
                                <img className="playlist-track-thumb" src={item.artwork} alt={item.title} loading="lazy" />
                                <div className="playlist-track-copy">
                                  <div className="playlist-track-title">{item.title}</div>
                                  <div className="playlist-track-artist">{item.artist}</div>
                                </div>
                                <button
                                  type="button"
                                  className="icon-ghost-btn danger"
                                  onClick={() => onRemoveTrack(playlist.id, item.id)}
                                  aria-label="Hapus dari playlist"
                                >
                                  <XIcon className="icon-18" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
