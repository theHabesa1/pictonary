# 🎨 Pictonary

Free, real-time online Pictionary for family & friends. No sign-up: create a room, share the link, draw and guess.

Built with **Svelte 5** + **Vite** on the front end and **Node + Socket.IO** for real-time multiplayer.

## Features

- **Two game modes**
  - 🙋 **Every player**: everyone guesses, faster guesses score more, and the drawer earns points for each correct guess.
  - 👨‍👩‍👧‍👦 **Teams** (2–4 teams): teams take turns. Your teammates guess your drawing. Optional **steals** let other teams guess first and take the points.
- 💡 **Letter hints**: as the clock runs down, random letters of the word are revealed (0–5 hints, set by the host). Works in both modes.
- 🖌️ **Drawing tools**: 20 colors plus a custom color picker, 5 brush sizes, eraser, fill bucket, undo, and clear. Keyboard shortcuts `B` `E` `F` `1-5` `Ctrl+Z`.
- 🎯 3 word choices per turn (easy / medium / hard; harder words are worth more), ~500 family-friendly words in 9 categories, plus **custom words** in any language.
- 🔥 "So close!" hints for near-miss guesses. Correct guesses are hidden, and players who already guessed chat privately.
- 😂 Live emoji reactions, sound effects, a podium with confetti, and a team scoreboard.
- 📱 Works on phones, tablets and desktop. If you refresh or your Wi-Fi drops, you rejoin with your points intact.
- 👑 Host controls: settings, kick, skip turn, end game. If the host leaves, host passes to another player automatically.

## Run locally

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

For development with hot reload: `npm run dev`.

Run the multiplayer smoke test (with the server running): `npm test`.

## Deploy (free)

**Render** (free web service, supports WebSockets):

1. Push this repo to GitHub.
2. Open `https://render.com/deploy?repo=<your GitHub repo URL>`, or in the Render dashboard choose **New → Blueprint** and pick the repo.
3. Render reads `render.yaml`, builds, and gives you a `https://….onrender.com` URL.

Free instances sleep after 15 minutes without visitors. The first visit after that takes about a minute to wake up.

A `Dockerfile` is included for any container host (Koyeb, Fly.io, Railway, a VPS).

## Project layout

```
server/   index.js (HTTP + Socket.IO), room.js (game engine), words.js (word lists)
shared/   constants.js (settings, teams, palette, shared by client & server)
src/      Svelte app: components/, lib/ (socket store, canvas engine, sounds)
scripts/  smoke.js (end-to-end multiplayer test)
```
