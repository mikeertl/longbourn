# Longbourn

A minimal static web app for allocating Longbourn Friday tennis slots through
WhatsApp messages.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server.
There is no build step and no database.

## GitHub Pages

This app is designed to be hosted directly from the repository root with GitHub
Pages.

The app stores working state in:

- the latest WhatsApp post;
- the `#state=...` link fragment;
- browser `localStorage` for convenience.

Yellow availability means "ask first", not a normal reserve. A yellow slot
should only become a confirmed allocation after a WhatsApp exchange.
