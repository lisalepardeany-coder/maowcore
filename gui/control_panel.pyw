"""
MaowCore Control Panel — cosmic-themed live dashboard for the Discord music bot.

Features:
    - Live now-playing with album art
    - Queue + scrolling log
    - Transport controls + debounced volume slider
    - System tray icon (minimize-to-tray on close)
    - Global hotkeys (work even while gaming):
          F8       — Pause/Resume
          F9       — Skip
          Ctrl+F10 — Volume Down (-5)
          Ctrl+F11 — Volume Up (+5)

Requires:
    pip install -r requirements.txt
        (websocket-client, Pillow, requests, pystray, keyboard)

Run:
    python control_panel.pyw
"""

import io
import json
import os
import queue
import threading
import time
import tkinter as tk
from datetime import datetime
from tkinter import ttk

try:
    import websocket  # websocket-client
except ImportError:
    raise SystemExit("Missing dependency:  pip install -r requirements.txt")

from PIL import Image, ImageDraw, ImageTk

# Optional features — degrade gracefully if not installed
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    import pystray
    HAS_TRAY = True
except ImportError:
    HAS_TRAY = False

try:
    import keyboard as kb
    HAS_HOTKEYS = True
except ImportError:
    HAS_HOTKEYS = False

# Hotkey config file
HOTKEYS_PATH = os.path.join(os.path.dirname(__file__), "hotkeys.json")
DEFAULT_HOTKEYS = {
    "pause_resume": "f8",
    "skip": "f9",
    "vol_down": "ctrl+f10",
    "vol_up": "ctrl+f11",
}

def load_hotkeys():
    try:
        with open(HOTKEYS_PATH, "r", encoding="utf-8") as f:
            return {**DEFAULT_HOTKEYS, **json.load(f)}
    except Exception:
        return dict(DEFAULT_HOTKEYS)

def save_hotkeys(cfg):
    try:
        with open(HOTKEYS_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception:
        pass


WS_URL = "ws://127.0.0.1:8765"

# Cosmic palette
COSMIC = "#8B5CF6"
NEBULA = "#06B6D4"
FLARE = "#EF4444"
AMBER = "#FBBF24"
BG_DEEP = "#0F0B1E"
BG_PANEL = "#1A1530"
BG_INPUT = "#221C3A"
FG_TEXT = "#E5DDFB"
FG_MUTED = "#9088B8"
FG_DIM = "#5F5680"

FONT_UI = ("Segoe UI", 10)
FONT_HEADER = ("Segoe UI", 13, "bold")
FONT_TITLE = ("Segoe UI", 16, "bold")
FONT_BIG = ("Segoe UI", 20, "bold")
FONT_MONO = ("Consolas", 11)
FONT_MONO_S = ("Consolas", 10)

THUMB_SIZE = 120


def fmt_clock(sec):
    if sec is None:
        return "—"
    sec = max(0, int(sec))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def progress_bar(cur, total, length=22):
    if not total:
        return "─" * length
    ratio = max(0.0, min(1.0, cur / total))
    pos = int(ratio * length)
    return "─" * pos + "◆" + "─" * max(0, length - pos - 1)


def cosmic_button(parent, text, command, bg=BG_INPUT, fg=FG_TEXT, width=None):
    btn = tk.Button(
        parent, text=text, command=command,
        bg=bg, fg=fg, activebackground=COSMIC, activeforeground="white",
        relief="flat", borderwidth=0, font=FONT_UI, cursor="hand2",
        padx=10, pady=6,
    )
    if width:
        btn.configure(width=width)
    btn.bind("<Enter>", lambda e: btn.configure(bg=COSMIC, fg="white"))
    btn.bind("<Leave>", lambda e: btn.configure(bg=bg, fg=fg))
    return btn


def make_tray_icon_image(size=64):
    """Draw a small cosmic-themed icon for the system tray."""
    img = Image.new("RGBA", (size, size), (15, 11, 30, 255))
    draw = ImageDraw.Draw(img)
    cx, cy, r = size / 2, size / 2, size / 3
    # Outer ring
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(139, 92, 246, 255), width=3)
    # Inner diamond
    d = r * 0.55
    draw.polygon([(cx, cy - d), (cx + d, cy), (cx, cy + d), (cx - d, cy)],
                 fill=(139, 92, 246, 255))
    # Spark dots
    for px, py in [(cx - r - 4, cy - r - 2), (cx + r + 2, cy + r + 4),
                   (cx + r + 4, cy - r - 2), (cx - r - 2, cy + r + 4)]:
        draw.ellipse((px - 1, py - 1, px + 1, py + 1), fill=(6, 182, 212, 255))
    return img


class WSClient(threading.Thread):
    def __init__(self, url, incoming, outgoing):
        super().__init__(daemon=True)
        self.url = url
        self.incoming = incoming
        self.outgoing = outgoing
        self.ws = None
        self.stop_flag = threading.Event()

    def run(self):
        while not self.stop_flag.is_set():
            try:
                self.ws = websocket.WebSocketApp(
                    self.url,
                    on_open=self._on_open, on_message=self._on_message,
                    on_error=self._on_error, on_close=self._on_close,
                )
                self.incoming.put({"type": "_status", "connected": False, "msg": "connecting…"})
                self.ws.run_forever(ping_interval=20, ping_timeout=10)
            except Exception as e:
                self.incoming.put({"type": "_status", "connected": False, "msg": str(e)})
            if self.stop_flag.is_set():
                break
            time.sleep(2)

    def _on_open(self, ws):
        self.incoming.put({"type": "_status", "connected": True, "msg": "connected"})
        threading.Thread(target=self._send_loop, daemon=True).start()

    def _on_message(self, ws, raw):
        try: self.incoming.put(json.loads(raw))
        except Exception: pass

    def _on_error(self, ws, err):
        self.incoming.put({"type": "_status", "connected": False, "msg": f"error: {err}"})

    def _on_close(self, ws, code, reason):
        self.incoming.put({"type": "_status", "connected": False, "msg": "disconnected"})

    def _send_loop(self):
        while self.ws and self.ws.sock and self.ws.sock.connected:
            try: msg = self.outgoing.get(timeout=0.25)
            except queue.Empty: continue
            try: self.ws.send(json.dumps(msg))
            except Exception as e:
                self.incoming.put({"type": "_status", "connected": False, "msg": f"send failed: {e}"})
                return

    def shutdown(self):
        self.stop_flag.set()
        if self.ws:
            try: self.ws.close()
            except Exception: pass


class ThumbLoader(threading.Thread):
    """Downloads album art on a background thread, caches one image per URL."""
    def __init__(self, callback):
        super().__init__(daemon=True)
        self.callback = callback
        self.queue = queue.Queue()
        self.cache_url = None
        self.cache_img = None

    def request(self, url):
        if url and url != self.cache_url:
            self.queue.put(url)

    def run(self):
        if not HAS_REQUESTS:
            return
        while True:
            url = self.queue.get()
            try:
                while not self.queue.empty():
                    url = self.queue.get_nowait()
            except queue.Empty:
                pass
            try:
                r = requests.get(url, timeout=5)
                img = Image.open(io.BytesIO(r.content)).convert("RGBA")
                img.thumbnail((THUMB_SIZE, THUMB_SIZE))
                self.cache_url = url
                self.cache_img = img
                self.callback(img)
            except Exception:
                pass


class ControlPanel(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("◆ MaowCore Control")
        self.geometry("1180x740")
        self.minsize(950, 600)
        self.configure(bg=BG_DEEP)

        self.incoming = queue.Queue()
        self.outgoing = queue.Queue()
        self.ws_client = WSClient(WS_URL, self.incoming, self.outgoing)
        self.thumb_loader = ThumbLoader(self._set_thumb)
        self.thumb_loader.start()
        self._photo_ref = None

        self.state_msg = None
        self.connected = False
        self._vol_after = None
        self._tray = None
        self._minimized_to_tray = False

        self._configure_ttk()
        self._build_ui()

        self.ws_client.start()
        self.after(100, self._poll)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._setup_tray()
        self._setup_hotkeys()

    # ---------- ttk theming ----------
    def _configure_ttk(self):
        style = ttk.Style()
        try: style.theme_use("clam")
        except tk.TclError: pass
        style.configure(
            "Cosmic.Horizontal.TScale",
            background=BG_PANEL, troughcolor=BG_INPUT,
            bordercolor=BG_PANEL, lightcolor=COSMIC, darkcolor=COSMIC,
        )

    # ---------- UI ----------
    def _panel(self, parent):
        return tk.Frame(parent, bg=BG_PANEL, highlightthickness=1, highlightbackground="#2A2245")

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=3)
        self.grid_columnconfigure(1, weight=2)
        self.grid_rowconfigure(0, weight=0)
        self.grid_rowconfigure(1, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Header
        header = self._panel(self)
        header.grid(row=0, column=0, columnspan=2, padx=12, pady=(12, 6), sticky="ew")
        header.grid_columnconfigure(1, weight=1)
        tk.Label(header, text="◆  MaowCore Control",
                 fg=COSMIC, bg=BG_PANEL, font=FONT_BIG
                 ).grid(row=0, column=0, padx=14, pady=10, sticky="w")
        self.status_label = tk.Label(header, text="● disconnected",
                                     fg=FLARE, bg=BG_PANEL, font=FONT_UI)
        self.status_label.grid(row=0, column=1, padx=14, pady=10, sticky="e")

        # Now Playing
        np_frame = self._panel(self)
        np_frame.grid(row=1, column=0, padx=(12, 6), pady=6, sticky="nsew")
        np_frame.grid_columnconfigure(1, weight=1)
        np_frame.grid_rowconfigure(2, weight=1)
        tk.Label(np_frame, text="◆  NOW TRANSMITTING",
                 fg=COSMIC, bg=BG_PANEL, font=FONT_HEADER
                 ).grid(row=0, column=0, columnspan=2, padx=14, pady=(12, 6), sticky="w")
        self.thumb_label = tk.Label(np_frame, bg=BG_INPUT, width=THUMB_SIZE, height=THUMB_SIZE)
        self.thumb_label.grid(row=1, column=0, rowspan=3, padx=(14, 8), pady=(0, 12), sticky="nw")
        info = tk.Frame(np_frame, bg=BG_PANEL)
        info.grid(row=1, column=1, rowspan=3, padx=(0, 14), pady=(0, 12), sticky="nsew")
        info.grid_columnconfigure(0, weight=1)
        info.grid_rowconfigure(1, weight=1)
        self.np_title = tk.Label(info, text="— no signal —",
                                 fg=FG_TEXT, bg=BG_PANEL, font=FONT_TITLE,
                                 anchor="w", justify="left", wraplength=480)
        self.np_title.grid(row=0, column=0, sticky="ew")
        self.np_meta = tk.Label(info, text="",
                                fg=FG_MUTED, bg=BG_PANEL, font=FONT_UI,
                                anchor="nw", justify="left", wraplength=480)
        self.np_meta.grid(row=1, column=0, pady=(4, 0), sticky="nw")
        self.np_progress = tk.Label(info, text="—", fg=NEBULA, bg=BG_PANEL,
                                    font=FONT_MONO, anchor="w")
        self.np_progress.grid(row=2, column=0, pady=(6, 0), sticky="ew")

        # Controls
        ctrl = self._panel(self)
        ctrl.grid(row=2, column=0, padx=(12, 6), pady=(6, 12), sticky="nsew")
        ctrl.grid_columnconfigure(0, weight=1)
        play_row = tk.Frame(ctrl, bg=BG_PANEL)
        play_row.grid(row=0, column=0, padx=12, pady=(12, 6), sticky="ew")
        play_row.grid_columnconfigure(0, weight=1)
        self.play_entry = tk.Entry(
            play_row, bg=BG_INPUT, fg=FG_TEXT, insertbackground=COSMIC,
            relief="flat", font=FONT_UI, highlightthickness=1,
            highlightbackground=COSMIC, highlightcolor=COSMIC,
        )
        self._add_placeholder(self.play_entry, "URL or search query…")
        self.play_entry.grid(row=0, column=0, padx=(0, 6), ipady=6, sticky="ew")
        self.play_entry.bind("<Return>", lambda e: self._do_play())
        cosmic_button(play_row, "✦  Play", self._do_play, bg=COSMIC, fg="white").grid(row=0, column=1)

        transport = tk.Frame(ctrl, bg=BG_PANEL)
        transport.grid(row=1, column=0, padx=12, pady=6, sticky="ew")
        btns = [
            ("⏸/▶", self._toggle_pause),
            ("⏭",   lambda: self._send("skip")),
            ("⏹",   lambda: self._send("stop")),
            ("✦",   lambda: self._send("shuffle")),
            ("↻",   self._cycle_loop),
            ("⌬",   lambda: self._send("leave")),
        ]
        for i in range(len(btns)): transport.grid_columnconfigure(i, weight=1)
        for i, (label, cmd) in enumerate(btns):
            cosmic_button(transport, label, cmd).grid(row=0, column=i, padx=3, sticky="ew")

        vol_row = tk.Frame(ctrl, bg=BG_PANEL)
        vol_row.grid(row=2, column=0, padx=12, pady=(6, 12), sticky="ew")
        vol_row.grid_columnconfigure(1, weight=1)
        tk.Label(vol_row, text="⌬ vol", fg=FG_MUTED, bg=BG_PANEL, font=FONT_UI
                 ).grid(row=0, column=0, padx=(0, 8))
        self.vol_slider = ttk.Scale(
            vol_row, from_=0, to=150, orient="horizontal",
            style="Cosmic.Horizontal.TScale", command=self._on_vol_change,
        )
        self.vol_slider.set(100)
        self.vol_slider.grid(row=0, column=1, sticky="ew")
        self.vol_label = tk.Label(vol_row, text="100%", fg=FG_TEXT, bg=BG_PANEL,
                                  font=FONT_UI, width=5)
        self.vol_label.grid(row=0, column=2, padx=(8, 0))

        # Footer row: hotkey hint + edit button
        footer = tk.Frame(ctrl, bg=BG_PANEL)
        footer.grid(row=3, column=0, padx=12, pady=(0, 10), sticky="ew")
        footer.grid_columnconfigure(0, weight=1)
        hint_bits = []
        if HAS_HOTKEYS: hint_bits.append("Hotkeys configurable")
        if HAS_TRAY: hint_bits.append("Close hides to tray")
        tk.Label(footer, text=" · ".join(hint_bits), fg=FG_DIM, bg=BG_PANEL,
                 font=("Segoe UI", 9)).grid(row=0, column=0, sticky="w")
        if HAS_HOTKEYS:
            cosmic_button(footer, "✦  Edit hotkeys", self.open_hotkey_editor).grid(row=0, column=1, sticky="e")

        # Queue
        q_frame = self._panel(self)
        q_frame.grid(row=1, column=1, padx=(6, 12), pady=6, sticky="nsew")
        q_frame.grid_columnconfigure(0, weight=1)
        q_frame.grid_rowconfigure(1, weight=1)
        tk.Label(q_frame, text="✦  TRANSMISSION QUEUE",
                 fg=COSMIC, bg=BG_PANEL, font=FONT_HEADER
                 ).grid(row=0, column=0, padx=14, pady=(12, 6), sticky="w")
        q_inner = tk.Frame(q_frame, bg=BG_PANEL)
        q_inner.grid(row=1, column=0, padx=12, pady=(0, 12), sticky="nsew")
        q_inner.grid_columnconfigure(0, weight=1)
        q_inner.grid_rowconfigure(0, weight=1)
        self.queue_box = tk.Text(
            q_inner, bg=BG_DEEP, fg=FG_TEXT, font=FONT_MONO_S,
            wrap="none", relief="flat", borderwidth=0,
            insertbackground=FG_TEXT, padx=8, pady=8,
        )
        self.queue_box.grid(row=0, column=0, sticky="nsew")
        q_scroll = tk.Scrollbar(q_inner, command=self.queue_box.yview, bg=BG_PANEL)
        q_scroll.grid(row=0, column=1, sticky="ns")
        self.queue_box.configure(yscrollcommand=q_scroll.set, state="disabled")

        # Log feed
        log_frame = self._panel(self)
        log_frame.grid(row=2, column=1, padx=(6, 12), pady=(6, 12), sticky="nsew")
        log_frame.grid_columnconfigure(0, weight=1)
        log_frame.grid_rowconfigure(1, weight=1)
        tk.Label(log_frame, text="⌬  LIVE LOG",
                 fg=COSMIC, bg=BG_PANEL, font=FONT_HEADER
                 ).grid(row=0, column=0, padx=14, pady=(12, 6), sticky="w")
        l_inner = tk.Frame(log_frame, bg=BG_PANEL)
        l_inner.grid(row=1, column=0, padx=12, pady=(0, 12), sticky="nsew")
        l_inner.grid_columnconfigure(0, weight=1)
        l_inner.grid_rowconfigure(0, weight=1)
        self.log_box = tk.Text(
            l_inner, bg=BG_DEEP, fg=FG_TEXT, font=FONT_MONO_S,
            wrap="word", relief="flat", borderwidth=0,
            insertbackground=FG_TEXT, padx=8, pady=8,
        )
        self.log_box.grid(row=0, column=0, sticky="nsew")
        l_scroll = tk.Scrollbar(l_inner, command=self.log_box.yview, bg=BG_PANEL)
        l_scroll.grid(row=0, column=1, sticky="ns")
        self.log_box.configure(yscrollcommand=l_scroll.set, state="disabled")
        self.log_box.tag_config("error", foreground=FLARE)
        self.log_box.tag_config("warn", foreground=AMBER)
        self.log_box.tag_config("info", foreground=FG_TEXT)
        self.log_box.tag_config("ts", foreground=FG_DIM)

    def _add_placeholder(self, entry, text):
        entry.insert(0, text)
        entry.configure(fg=FG_DIM)
        def on_in(_e):
            if entry.get() == text:
                entry.delete(0, "end"); entry.configure(fg=FG_TEXT)
        def on_out(_e):
            if not entry.get():
                entry.insert(0, text); entry.configure(fg=FG_DIM)
        entry.bind("<FocusIn>", on_in)
        entry.bind("<FocusOut>", on_out)

    # ---------- Tray icon ----------
    def _setup_tray(self):
        if not HAS_TRAY:
            return
        image = make_tray_icon_image()
        menu = pystray.Menu(
            pystray.MenuItem("Show window", self._restore_from_tray, default=True),
            pystray.MenuItem("Pause / Resume", lambda: self._toggle_pause()),
            pystray.MenuItem("Skip", lambda: self._send("skip")),
            pystray.MenuItem("Stop", lambda: self._send("stop")),
            pystray.MenuItem("Edit hotkeys…", lambda: self.after(0, self.open_hotkey_editor)),
            pystray.MenuItem("Quit", self._quit_from_tray),
        )
        self._tray = pystray.Icon("MaowCore", image, "MaowCore Control", menu)
        threading.Thread(target=self._tray.run, daemon=True).start()

    def _hide_to_tray(self):
        if not self._tray:
            self._real_quit(); return
        self._minimized_to_tray = True
        self.withdraw()

    def _restore_from_tray(self, *args):
        self._minimized_to_tray = False
        self.after(0, lambda: (self.deiconify(), self.lift(), self.focus_force()))

    def _quit_from_tray(self, *args):
        self.after(0, self._real_quit)

    # ---------- Global hotkeys ----------
    def _setup_hotkeys(self):
        if not HAS_HOTKEYS:
            return
        cfg = load_hotkeys()
        try:
            kb.unhook_all_hotkeys()
        except Exception:
            pass
        try:
            kb.add_hotkey(cfg["pause_resume"], lambda: self.after(0, self._toggle_pause))
            kb.add_hotkey(cfg["skip"], lambda: self.after(0, lambda: self._send("skip")))
            kb.add_hotkey(cfg["vol_down"], lambda: self.after(0, lambda: self._nudge_volume(-5)))
            kb.add_hotkey(cfg["vol_up"], lambda: self.after(0, lambda: self._nudge_volume(5)))
        except Exception as e:
            self._append_log(f"hotkey setup failed: {e}", "warn")

    def open_hotkey_editor(self):
        if not HAS_HOTKEYS:
            return
        cfg = load_hotkeys()
        win = tk.Toplevel(self)
        win.title("Custom Hotkeys")
        win.configure(bg=BG_DEEP)
        win.geometry("420x260")
        tk.Label(win, text="◆  HOTKEY EDITOR", fg=COSMIC, bg=BG_DEEP, font=FONT_HEADER).pack(pady=12)
        entries = {}
        for key, label in [
            ("pause_resume", "Pause / Resume"),
            ("skip", "Skip"),
            ("vol_down", "Volume −5"),
            ("vol_up", "Volume +5"),
        ]:
            row = tk.Frame(win, bg=BG_DEEP)
            row.pack(fill="x", padx=24, pady=6)
            tk.Label(row, text=label, fg=FG_TEXT, bg=BG_DEEP, font=FONT_UI, width=18, anchor="w").pack(side="left")
            e = tk.Entry(row, bg=BG_INPUT, fg=FG_TEXT, insertbackground=COSMIC, relief="flat",
                         font=FONT_UI, highlightthickness=1, highlightbackground=COSMIC, highlightcolor=COSMIC)
            e.insert(0, cfg.get(key, ""))
            e.pack(side="left", fill="x", expand=True, ipady=4)
            entries[key] = e
        def apply_changes():
            new_cfg = {k: e.get().strip() or DEFAULT_HOTKEYS[k] for k, e in entries.items()}
            save_hotkeys(new_cfg)
            self._setup_hotkeys()
            win.destroy()
        cosmic_button(win, "✦  Save & Apply", apply_changes, bg=COSMIC, fg="white").pack(pady=14)
        tk.Label(win, text="Use names like f8, ctrl+s, alt+space, num+plus.",
                 fg=FG_DIM, bg=BG_DEEP, font=("Segoe UI", 9)).pack()

    def _nudge_volume(self, delta):
        q = self._first_queue()
        if not q:
            return
        v = max(0, min(150, q["volume"] + delta))
        self.vol_slider.set(v)
        self.vol_label.configure(text=f"{v}%")
        self._send("volume", value=v)

    # ---------- Helpers ----------
    def _first_queue(self):
        if not self.state_msg or not self.state_msg.get("queues"):
            return None
        return self.state_msg["queues"][0]

    def _send(self, action, **kw):
        if not self.connected:
            self._append_log("Not connected to bot.", "warn"); return
        self.outgoing.put({"type": "cmd", "action": action, **kw})

    def _do_play(self):
        q = self.play_entry.get().strip()
        if not q or q == "URL or search query…":
            return
        self._send("play", query=q)
        self.play_entry.delete(0, "end")

    def _toggle_pause(self):
        q = self._first_queue()
        if not q: return
        self._send("resume" if q["paused"] else "pause")

    def _cycle_loop(self):
        q = self._first_queue()
        if not q: return
        self._send("loop", value=(q["repeatMode"] + 1) % 3)

    def _on_vol_change(self, value):
        v = int(float(value))
        self.vol_label.configure(text=f"{v}%")
        if self._vol_after: self.after_cancel(self._vol_after)
        self._vol_after = self.after(200, lambda: self._send_volume(v))

    def _send_volume(self, v):
        self._vol_after = None
        self._send("volume", value=v)

    # ---------- Polling / render ----------
    def _poll(self):
        try:
            while True:
                msg = self.incoming.get_nowait()
                self._handle(msg)
        except queue.Empty:
            pass
        self.after(100, self._poll)

    def _handle(self, msg):
        t = msg.get("type")
        if t == "_status":
            self.connected = msg.get("connected", False)
            color = NEBULA if self.connected else FLARE
            self.status_label.configure(text=f"● {msg.get('msg', '')}", fg=color)
            if not self.connected: self._reset_now_playing()
            return
        if t == "hello":
            tag = msg.get("botTag") or "bot"
            self.title(f"◆ MaowCore Control — {tag}")
            return
        if t == "log":
            self._append_log(msg.get("text", ""), msg.get("level", "info"), msg.get("ts"))
            return
        if t == "log_history":
            for e in msg.get("entries", []):
                self._append_log(e.get("text", ""), e.get("level", "info"), e.get("ts"))
            return
        if t == "state":
            self.state_msg = msg
            self._render_state()
            return

    def _append_log(self, text, level="info", ts=None):
        when = datetime.fromtimestamp((ts or time.time() * 1000) / 1000).strftime("%H:%M:%S")
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"{when}  ", ("ts",))
        self.log_box.insert("end", f"{text}\n", (level,))
        line_count = int(self.log_box.index("end-1c").split(".")[0])
        if line_count > 1000:
            self.log_box.delete("1.0", f"{line_count - 1000}.0")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _reset_now_playing(self):
        self.np_title.configure(text="— no signal —")
        self.np_meta.configure(text="")
        self.np_progress.configure(text="—")
        self.thumb_label.configure(image="")
        self._photo_ref = None
        self.queue_box.configure(state="normal")
        self.queue_box.delete("1.0", "end")
        self.queue_box.configure(state="disabled")

    def _set_thumb(self, pil_image):
        # Called from thumb-loader thread → marshal to GUI thread
        def apply():
            self._photo_ref = ImageTk.PhotoImage(pil_image)
            self.thumb_label.configure(image=self._photo_ref, width=THUMB_SIZE, height=THUMB_SIZE)
        self.after(0, apply)

    def _render_state(self):
        q = self._first_queue()
        if not q or not q.get("currentSong"):
            self._reset_now_playing(); return
        s = q["currentSong"]
        self.np_title.configure(text=s["name"])
        meta_parts = [
            f"requested by {s['user']}",
            f"vol {q['volume']}%",
            f"loop {['off','signal','queue'][q['repeatMode']]}",
        ]
        if q["filters"]: meta_parts.append(f"filters: {', '.join(q['filters'])}")
        if q.get("voiceChannelName"): meta_parts.append(f"in #{q['voiceChannelName']}")
        meta = "   ·   ".join(meta_parts)
        if q["paused"]: meta = "⏸  PAUSED   ·   " + meta
        self.np_meta.configure(text=meta)
        cur = s.get("currentTime", 0) or 0
        total = s.get("duration") or 0
        self.np_progress.configure(
            text=f"{fmt_clock(cur)}  {progress_bar(cur, total)}  {s['formattedDuration']}",
        )
        if s.get("thumbnail"):
            self.thumb_loader.request(s["thumbnail"])

        if not self._vol_after:
            self.vol_slider.set(q["volume"])
            self.vol_label.configure(text=f"{q['volume']}%")

        upcoming = q.get("upcoming", [])
        self.queue_box.configure(state="normal")
        self.queue_box.delete("1.0", "end")
        if not upcoming:
            self.queue_box.insert("end", "— cargo hold empty —")
        else:
            for i, song in enumerate(upcoming, 1):
                self.queue_box.insert("end", f"{i:>2}.  {song['name']}  [{song['formattedDuration']}]\n")
        self.queue_box.configure(state="disabled")

    # ---------- Exit handling ----------
    def _on_close(self):
        if HAS_TRAY and self._tray:
            self._hide_to_tray()
        else:
            self._real_quit()

    def _real_quit(self):
        try:
            if HAS_HOTKEYS:
                kb.unhook_all_hotkeys()
        except Exception:
            pass
        if self._tray:
            try: self._tray.stop()
            except Exception: pass
        self.ws_client.shutdown()
        self.destroy()


if __name__ == "__main__":
    app = ControlPanel()
    app.mainloop()
