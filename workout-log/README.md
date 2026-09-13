# Workout Log

A small offline web app for logging weightlifting sets and treadmill sessions on a phone.
Plain HTML, CSS and JavaScript. No build step, no accounts, no server. All data stays in
the phone's browser (IndexedDB); JSON export is the only backup route.

## Use it

1. Turn on GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main`, root).
2. Open the Pages URL on your phone.
3. Add it to the home screen (iOS Safari: Share → Add to Home Screen; Android Chrome:
   menu → Install app). It then runs full screen and works offline.

## Screens

- **Today** — log the current workout. Tap an exercise chip to add it, then `+ Set`. Each
  new set copies the previous one, so a straight-set day is mostly tapping. Weights show
  what you did last time; the treadmill row takes minutes, distance, speed and incline.
- **History** — every workout, newest first. Tap one to edit or delete it. Add a past date
  with the date picker at the top.
- **Progress** — per exercise: best set, last session, top-set and volume charts. For the
  treadmill: distance, speed and minutes over time.
- **Settings** — add, rename, reorder and archive exercises; kg/lb and km/mi labels;
  export and import JSON; delete all data.

## Files

```
index.html            page shell and tab bar
style.css             mobile-first styles
store.js              IndexedDB store: exercises, workouts, settings, export/import
app.js                the four screens
sw.js                 service worker for offline use (bump CACHE when files change)
manifest.webmanifest  PWA manifest
icon.svg / *.png      app icon
```

## Data shape

```
exercise  { id, name, type: "weights" | "cardio", order, archived }
workout   { id, date: "YYYY-MM-DD", note, entries: [entry] }
entry     { id, exerciseId, sets: [{ weight, reps }] }             // weights
          { id, exerciseId, cardio: { minutes, distance, speed, incline } }  // cardio
```
