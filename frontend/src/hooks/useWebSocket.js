import { useEffect, useRef, useCallback, useState } from 'react';

export function useWebSocket(url) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Map());

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = url || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setConnected(true);
      // Heartbeat
      const interval = setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(interval);
        }
      }, 30000);
    };

    ws.current.onclose = () => {
      setConnected(false);
      // Reconnect
      setTimeout(connect, 2000);
    };

    ws.current.onerror = () => {
      ws.current?.close();
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        listeners.current.forEach((fn) => fn(data));
      } catch (_) {}
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const addListener = useCallback((id, fn) => {
    listeners.current.set(id, fn);
    return () => listeners.current.delete(id);
  }, []);

  return { send, connected, addListener };
}
