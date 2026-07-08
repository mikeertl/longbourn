# Longbourn

A minimal static web app for allocating Longbourn Friday tennis slots through
WhatsApp messages.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server.
There is no build step and no database.

## GitHub Pages

This app is designed to be hosted directly from the repository root with GitHub
Pages.

The app stores shared working state in:

- `data/current.json` in this GitHub repository;
- browser `localStorage` for convenience.

Yellow availability means "ask first", not a normal reserve. A yellow slot
should only become a confirmed allocation after a WhatsApp exchange.

## Shared saving

Anyone can read the shared rota. To save changes back to GitHub, an organiser
needs to paste a GitHub fine-grained personal access token into the app. The
token needs `Contents: Read and write` permission for this repository only.

The token is stored only in that browser's `localStorage`; it is not committed
to the app.

With shared saving enabled, WhatsApp can just contain the app link rather than a
long encoded state blob.
