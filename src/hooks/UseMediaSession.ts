import { useEffect, useRef } from "react";

type MediaSessionHandlers = {
  onPlay?: () => void;
  onPause?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
};

type MediaSessionMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
};

export function useMediaSession(
  metadata: MediaSessionMetadata | null,
  playing: boolean,
  handlers: MediaSessionHandlers,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const session = navigator.mediaSession;

    try {
      if (metadata?.title) {
        session.metadata = new MediaMetadata({
          title: metadata.title,
          artist: metadata.artist || "",
          album: metadata.album || "",
          artwork: metadata.artwork
            ? [
                { src: metadata.artwork, sizes: "512x512", type: "image/jpeg" },
                { src: metadata.artwork, sizes: "256x256", type: "image/jpeg" },
              ]
            : [],
        });
      } else {
        session.metadata = null;
      }
    } catch {
      // metadata assignment failed
    }

    try {
      session.playbackState = playing ? "playing" : "paused";
    } catch {
      // ignore
    }
  }, [metadata?.title, metadata?.artist, metadata?.artwork, playing]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const session = navigator.mediaSession;

    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // unsupported action
      }
    };

    setHandler("play", () => handlersRef.current.onPlay?.());
    setHandler("pause", () => handlersRef.current.onPause?.());
    setHandler("previoustrack", () => handlersRef.current.onPrev?.());
    setHandler("nexttrack", () => handlersRef.current.onNext?.());
    setHandler("seekbackward", null);
    setHandler("seekforward", null);

    return () => {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("previoustrack", null);
      setHandler("nexttrack", null);
    };
  }, []);
}
