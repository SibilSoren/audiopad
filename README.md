# 🎧 AudioPad

A browser-based multi-track audio editor built with React, TypeScript, and the Web Audio API.

**[🔗 Live Demo](https://audio-pad.netlify.app/)**

![AudioPad Screenshot](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Vite](https://img.shields.io/badge/Vite-7-purple)

---

## ✨ Features

- **Multi-track audio editing** - Upload and manage multiple audio tracks
- **Waveform visualization** - Real-time 60fps canvas rendering
- **Track controls** - Volume, Mute (M), Solo (S) per track
- **Click-to-seek** - Click anywhere on the timeline to jump to that position
- **Album art extraction** - Automatically extracts and displays embedded album art
- **Keyboard shortcuts** - Space (play/pause), Esc (stop)
- **Exclusive solo mode** - Only one track can be solo'd at a time

---

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph UI["🖥️ UI Layer"]
        TC[TransportControls]
        TCL[TrackControls]
        WC[WaveformCanvas]
    end

    subgraph State["📦 Redux Store"]
        TS[transportSlice]
        TKS[tracksSlice]
        AM[audioMiddleware]
    end

    subgraph Audio["🔊 Audio Layer"]
        AE[AudioEngine]
        WA[Web Audio API]
    end

    TC -->|dispatch play/pause| TS
    TC -->|dispatch addTrack| TKS
    TCL -->|dispatch volume/mute| TKS
    WC -->|reads currentTime| AE
    
    TS --> AM
    TKS --> AM
    AM -->|controls| AE
    AE --> WA
```

### Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant TC as TransportControls
    participant R as Redux
    participant MW as Middleware
    participant AE as AudioEngine

    U->>TC: Upload audio file
    TC->>R: dispatch(addTrack)
    TC->>R: dispatch(loadTrackAudio)
    R->>AE: loadTrack(id, url)
    AE-->>R: peaks + buffer
    R-->>TC: Update UI
    
    U->>TC: Click Play
    TC->>R: dispatch(play)
    R->>MW: intercept action
    MW->>AE: play()
    AE-->>U: Audio plays 🔊
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **UI** | React 18, TypeScript |
| **State** | Redux Toolkit |
| **Audio** | Web Audio API |
| **Visualization** | Canvas API |
| **Metadata** | music-metadata-browser |
| **Build** | Vite |
| **Deploy** | Netlify |

---

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/SibilSoren/audiopad.git
cd audiopad

# Install
npm install

# Dev
npm run dev

# Build
npm run build
```

---

## 📁 Project Structure

```
src/
├── audio/
│   ├── AudioEngine.ts      # Singleton audio playback engine
│   └── AudioUtils.ts       # Buffer loading, peak extraction
├── components/
│   ├── TransportControls   # Header with play/pause/stop
│   ├── TrackControls       # Left panel track row
│   ├── WaveformCanvas      # Shared timeline canvas
│   └── HelpDialog          # Info modal
├── store/
│   ├── store.ts            # Redux store config
│   ├── transportSlice.ts   # Playback state
│   ├── tracksSlice.ts      # Track data + thunks
│   └── middleware/
│       └── audioMiddleware # Bridges Redux ↔ AudioEngine
└── styles/
    └── global.scss         # All styles (dark theme)
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Esc` | Stop |

---

## 📄 License

MIT
