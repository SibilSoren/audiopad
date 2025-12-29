# AudioWave Editor

A high-performance, browser-based Digital Audio Workstation (DAW) built with **React**, **Redux Toolkit**, and the **Web Audio API**.

![Demo](https://via.placeholder.com/800x400?text=AudioWave+Editor+Preview)

## 🚀 Features

*   **Multi-Track Audio Engine**: Built on the native Web Audio API for low-latency playback.
*   **60FPS Waveform Rendering**: Utilizes the Canvas API to render real-time visualizations without UI lag.
*   **Redux State Management**: Complex state (Playhead, Tracks, Muting) managed predictably with Redux Toolkit.
*   **Scalable Architecture**: Strict separation of concerns between `AudioEngine` (Core Logic) and `React` (UI).

## 🛠 Tech Stack

*   **Frontend**: React 18, TypeScript, Vite
*   **State**: Redux Toolkit, Redux Thunk
*   **Audio**: Web Audio API (AudioContext)
*   **Visuals**: HTML5 Canvas
*   **Styling**: SCSS Modules

## 🏗 Architecture

The app follows a strict Unidirectional Data Flow, but decouples the high-frequency Audio Clock from the React Render Cycle.

```mermaid
graph TD
    User --> UI[React UI]
    UI --> Redux
    Redux --> Middleware
    Middleware --> AudioEngine
    AudioEngine --> AudioContext
    AudioEngine -.-> Canvas[Canvas Renderer (60fps loop)]
```

## 📦 Installation

1.  Clone the repository
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the dev server:
    ```bash
    npm run dev
    ```

## 🧪 Testing

Run strict unit tests:
```bash
npm run test
```
(Note: Tests are currently being implemented)
