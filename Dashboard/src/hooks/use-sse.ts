"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function useSSE<T>(
  url: string,
  maxEntries: number = 1000
): {
  entries: T[];
  connected: boolean;
  paused: boolean;
  togglePause: () => void;
  clear: () => void;
} {
  const [entries, setEntries] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const bufferRef = useRef<T[]>([]);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      pausedRef.current = !prev;
      if (prev && bufferRef.current.length > 0) {
        setEntries((old) =>
          [...old, ...bufferRef.current].slice(-maxEntries)
        );
        bufferRef.current = [];
      }
      return !prev;
    });
  }, [maxEntries]);

  const clear = useCallback(() => {
    setEntries([]);
    bufferRef.current = [];
  }, []);

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout;
    let retryDelay = 1000;
    let eventSource: EventSource;

    function connect() {
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setConnected(true);
        retryDelay = 1000;
      };

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as T;
          if (pausedRef.current) {
            bufferRef.current.push(parsed);
            if (bufferRef.current.length > maxEntries) {
              bufferRef.current = bufferRef.current.slice(-maxEntries);
            }
          } else {
            setEntries((old) => [...old, parsed].slice(-maxEntries));
          }
        } catch {
          // skip
        }
      };

      eventSource.onerror = () => {
        setConnected(false);
        eventSource.close();
        retryTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30000);
          connect();
        }, retryDelay);
      };
    }

    connect();

    return () => {
      eventSource?.close();
      clearTimeout(retryTimeout);
    };
  }, [url, maxEntries]);

  return { entries, connected, paused, togglePause, clear };
}
