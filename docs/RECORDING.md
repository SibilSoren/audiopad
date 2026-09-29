# Recording the demo GIF

`README.md` points at `docs/demo.gif`. It is the first thing anyone sees, and this
app's value is entirely visual, so it is worth a few takes.

## What to capture

Roughly 15 seconds, showing the things that cannot be explained in prose:

1. **Drop two or three files in at once** — starts on the app's actual premise
2. **Press play** — the meters move, which is the moment it stops looking static
3. **Pull one fader down, solo another** — mixing, visibly
4. **Select a clip and drag its edge** to trim, then a top corner for a fade
5. **Press `S`** to split at the playhead
6. **Undo a couple of times** — shows the edits are safe to make
7. **Hit Export** and let the toast appear

Lead with playback and meters rather than the file drop: motion in the first second
is what stops someone scrolling past.

## Practicalities

- Window at **1280×800** or similar. Wider makes the text unreadable once GitHub
  scales it down.
- Use stems with obvious dynamics — drums and a vocal read far better on a meter
  than a sustained pad.
- Keep it **under about 5 MB** so it loads on a slow connection. 12–15 fps is
  plenty; this is an interface, not footage.
- On macOS, `Cmd+Shift+5` records to `.mov`, then convert:

```bash
ffmpeg -i recording.mov -vf "fps=12,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" docs/demo.gif
```

- Check the result at GitHub's rendered width before committing. Text that is
  crisp at full size often is not at half.

A still screenshot at `docs/screenshot.png` is a reasonable fallback if the GIF
will not fit the size budget.
