'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

// Inject xterm CSS dynamically (avoids TypeScript import issues)
const injectXtermStyles = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('xterm-styles')) return;

  const style = document.createElement('style');
  style.id = 'xterm-styles';
  style.textContent = `
    .xterm {
      cursor: text;
      position: relative;
      user-select: none;
      -ms-user-select: none;
      -webkit-user-select: none;
    }
    .xterm.focus, .xterm:focus { outline: none; }
    .xterm .xterm-helpers { position: absolute; top: 0; z-index: 5; }
    .xterm .xterm-helper-textarea {
      padding: 0;
      border: 0;
      margin: 0;
      position: absolute;
      opacity: 0;
      left: -9999em;
      top: 0;
      width: 0;
      height: 0;
      z-index: -5;
      white-space: nowrap;
      overflow: hidden;
      resize: none;
    }
    .xterm .composition-view {
      background: #000;
      color: #FFF;
      display: none;
      position: absolute;
      white-space: nowrap;
      z-index: 1;
    }
    .xterm .composition-view.active { display: block; }
    .xterm .xterm-viewport {
      background-color: #000;
      overflow-y: scroll;
      cursor: default;
      position: absolute;
      right: 0;
      left: 0;
      top: 0;
      bottom: 0;
    }
    .xterm .xterm-screen {
      position: relative;
    }
    .xterm .xterm-screen canvas {
      position: absolute;
      left: 0;
      top: 0;
    }
    .xterm .xterm-scroll-area { visibility: hidden; }
    .xterm-char-measure-element {
      display: inline-block;
      visibility: hidden;
      position: absolute;
      top: 0;
      left: -9999em;
      line-height: normal;
    }
    .xterm.enable-mouse-events { cursor: default; }
    .xterm.xterm-cursor-pointer, .xterm .xterm-cursor-pointer { cursor: pointer; }
    .xterm.column-select.focus { cursor: crosshair; }
    .xterm .xterm-accessibility,
    .xterm .xterm-message {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      right: 0;
      z-index: 10;
      color: transparent;
    }
    .xterm .live-region {
      position: absolute;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
    .xterm-dim { opacity: 0.5; }
    .xterm-underline-1 { text-decoration: underline; }
    .xterm-underline-2 { text-decoration: double underline; }
    .xterm-underline-3 { text-decoration: wavy underline; }
    .xterm-underline-4 { text-decoration: dotted underline; }
    .xterm-underline-5 { text-decoration: dashed underline; }
    .xterm-strikethrough { text-decoration: line-through; }
    .xterm-screen .xterm-decoration-container .xterm-decoration {
      z-index: 6;
      position: absolute;
    }
    .xterm-decoration-overview-ruler {
      z-index: 7;
      position: absolute;
      top: 0;
      right: 0;
      pointer-events: none;
    }
    .xterm-decoration-top { z-index: 2; position: relative; }
  `;
  document.head.appendChild(style);
};

interface SSHTerminalProps {
  sessionId: string;
  terminalGrant: string;
  serverName: string;
  onClose: () => void;
  onError: (error: string) => void;
}

// ✅ CHANGED: Connect to broker WebSocket, not Next.js
const BROKER_WS_URL = process.env.NEXT_PUBLIC_BROKER_WS_URL || 'ws://localhost:8080';

export default function SSHTerminal({
  sessionId,
  terminalGrant,
  serverName,
  onClose,
  onError
}: SSHTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    // Inject xterm CSS
    injectXtermStyles();

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#f59e0b',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#f59e0b40',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();

    term.loadAddon(fit);
    term.loadAddon(webLinks);
    
    // ✅ FIX: Open terminal and wait for it to be ready
    term.open(terminalRef.current);

    // ✅ FIX: Wait for terminal to fully render before fitting
    setTimeout(() => {
      try {
        fit.fit();
      } catch (e) {
        console.warn('Initial fit failed (expected on first render):', e);
      }
    }, 100);

    setTerminal(term);
    setFitAddon(fit);

    // Handle window resize
    const handleResize = () => {
      try {
        fit.fit();
      } catch (e) {
        console.warn('Resize fit failed:', e);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  // Connect WebSocket to BROKER (not Next.js)
  useEffect(() => {
    if (!terminal || !sessionId) return;

    // Connect to broker's SSH stream endpoint. The terminal grant is sent
    // as the first WebSocket message, not in the URL.
    const wsUrl = `${BROKER_WS_URL}/api/ssh/stream`;

    terminal.writeln('\x1b[33m🔐 Connecting to ShellVault SSH...\x1b[0m');
    terminal.writeln(`\x1b[90m   Server: ${serverName}\x1b[0m`);

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      socket.send(JSON.stringify({
        type: 'terminal_auth',
        sessionId,
        terminalGrant,
      }));
      terminal.writeln('\x1b[32m✓ Connected\x1b[0m');
      terminal.writeln('');

      // ✅ FIX: Wait for terminal to be fully ready before sending dimensions
      setTimeout(() => {
        if (fitAddon && socket.readyState === WebSocket.OPEN) {
          try {
            // Ensure terminal is fitted first
            fitAddon.fit();
            
            // Then get dimensions
            const dims = fitAddon.proposeDimensions();
            if (dims && dims.cols && dims.rows) {
              socket.send(`__RESIZE__:${dims.cols},${dims.rows}`);
              console.log(`📏 Initial terminal size: ${dims.cols}x${dims.rows}`);
            }
          } catch (e) {
            console.warn('Failed to send initial dimensions:', e);
            // Non-critical error, terminal will still work
          }
        }
      }, 200);
    };

    socket.onmessage = (event) => {
      terminal.write(event.data);
    };

    socket.onclose = (event) => {
      setConnected(false);
      if (event.code !== 1000) {
        terminal.writeln('');
        terminal.writeln('\x1b[31m✗ Connection closed unexpectedly\x1b[0m');
        terminal.writeln(`\x1b[90m   Code: ${event.code} - ${event.reason || 'Unknown'}\x1b[0m`);
        onError('Connection closed unexpectedly');
      } else {
        terminal.writeln('');
        terminal.writeln('\x1b[33m● Session ended\x1b[0m');
      }
    };

    socket.onerror = (error) => {
      terminal.writeln('\x1b[31m✗ Connection error\x1b[0m');
      onError('WebSocket connection error');
    };

    setWs(socket);

    // Handle terminal input
    const inputHandler = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    return () => {
      inputHandler.dispose();
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [terminal, sessionId, terminalGrant, fitAddon, onError, serverName]);

  // Handle resize events
  useEffect(() => {
    if (!fitAddon || !ws || ws.readyState !== WebSocket.OPEN) return;

    const handleResize = () => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols && dims.rows) {
          ws.send(`__RESIZE__:${dims.cols},${dims.rows}`);
        }
      } catch (e) {
        console.warn('Resize failed:', e);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitAddon, ws]);

  // Disconnect handler
  const handleDisconnect = useCallback(() => {
    if (ws) {
      ws.close(1000, 'User disconnected');
    }
    onClose();
  }, [ws, onClose]);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-sm text-zinc-400">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <span className="text-zinc-600">|</span>
          <span className="text-sm font-mono text-amber-500">{serverName}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDisconnect}
            className="px-3 py-1 text-sm bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Terminal Container */}
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}
