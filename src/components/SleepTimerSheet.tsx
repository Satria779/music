import { useEffect, useState } from "react";
import { XIcon, ClockIcon } from "./icons";

const OPTIONS = [5, 10, 15, 30, 60];

type Props = {
  open: boolean;
  remainingMs: number;
  onClose: () => void;
  onSelect: (minutes: number) => void;
  onCancel: () => void;
};

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function SleepTimerSheet({ open, remainingMs, onClose, onSelect, onCancel }: Props) {
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!open) setCustom("");
  }, [open]);

  if (!open) return null;

  const isActive = remainingMs > 0;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-header">
          <div className="sheet-title-group">
            <h3 className="sheet-title">Sleep Timer</h3>
            <p className="sheet-subtitle">
              {isActive ? `Berhenti otomatis dalam ${formatRemaining(remainingMs)}` : "Pilih durasi untuk menghentikan audio"}
            </p>
          </div>
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Tutup">
            <XIcon className="icon-20" />
          </button>
        </div>

        <div className="sheet-body">
          <div className="sleep-grid">
            {OPTIONS.map((option) => (
              <button key={option} type="button" className="sleep-chip" onClick={() => onSelect(option)}>
                <ClockIcon className="icon-18" />
                <span>{option} menit</span>
              </button>
            ))}
          </div>

          <div className="sleep-custom-row">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={240}
              placeholder="Custom menit"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="sleep-input"
            />
            <button
              type="button"
              className="primary-pill"
              onClick={() => {
                const value = Number(custom);
                if (Number.isFinite(value) && value > 0) {
                  onSelect(Math.min(240, Math.floor(value)));
                }
              }}
            >
              Set
            </button>
          </div>

          {isActive && (
            <button type="button" className="danger-pill" onClick={onCancel}>
              Batalkan timer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
