# Workout Log

A small offline web app for logging weightlifting sets and treadmill sessions on a phone.
Plain HTML, CSS and JavaScript. No build step, no accounts, no server. All data stays in
the phone's browser (IndexedDB); JSON export is the only backup route.

## Use it

1. Turn on GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main`, root).
2. Open the Pages URL on your phone.
3. Add it to the home screen (iOS Safari: Share → Add to Home Screen; Android Chrome:
   menu → Install app). It then runs full screen and works offline.

## The programme

The four main lifts follow GreySkull LP: two sets of five then a final set to failure
(deadlift is a single 5+ set). Each session you pick one of four days, lighter lift first:

- Overhead Press + Squat
- Bench Press (Machine) + Squat
- Overhead Press + Deadlift
- Bench Press (Machine) + Deadlift

The day chooser shows what you did last time for each lift and the target for today.
Targets follow the standard rule on the last set: 5 to 9 reps adds the increment, 10 or
more adds double, under 5 drops the weight by 10 percent. Increments default to 2.5 kg
for presses and 5 kg for squat and deadlift; edit them per lift in Settings.

Picking a day builds each lift's sets: a warmup ramp (bar, 50%, 70%, 90%) rounded to
what your plates can make, then the working sets. Tap a set's label to flip it between
warmup and working. Warmups are excluded from progress charts and from progression.

Barbell lifts show the plates per side. Bar weight and the plates you own are in Settings.

A rest timer starts each time you enter reps for a set. It dings at 90 s and again at
180 s (both adjustable). Sound depends on the phone being unmuted; JavaScript timers
pause when the screen locks, so keep the app in front between sets.

## Screens

- **Today** — choose a lifting day, or skip that and just add accessories or cardio.
  Accessories are freeform: `+ Set` copies the previous set. Cardio takes minutes,
  distance, speed and incline, plus a "warmup before lifting" tick.
- **History** — every workout, newest first. Tap one to edit or delete it. Add a past date
  with the date picker at the top.
- **Progress** — programme lifts: working weight, reps on the 5+ set, and estimated 1RM
  over time. Accessories: best set and volume. Cardio: distance, speed and minutes, with
  warmup sessions hidden by default.
- **Settings** — plate calculator, bar and plates, rest timer, exercises (add, rename,
  reorder, archive, set increment), units, export and import JSON, delete all data.

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
exercise  { id, key?, name, type: "weights" | "cardio", order, archived,
            program, scheme: "3x5+" | "1x5+", increment, barbell }
workout   { id, date: "YYYY-MM-DD", dayKey, note, entries: [entry] }
entry     { id, exerciseId, target, sets: [{ weight, reps, warmup? }] }            // weights
          { id, exerciseId, cardio: { minutes, distance, speed, incline, warmup? } }  // cardio
```
