# Longbourn

A minimal static web app for collecting Longbourn Friday tennis availability
and allocating games from shared JSON files in this repository.

- https://mikeertl.github.io/longbourn/

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server.
There is no build step and no paid database.

## GitHub Pages

This app is designed to be hosted directly from the repository root with GitHub
Pages.

The app stores shared working data in:

- `data/current.json` for slots, availability, and allocations;
- `data/users.json` for the shared user list;
- browser `localStorage` for the signed-in name and token.

Players sign in by selecting their name and pasting a GitHub fine-grained
personal access token with `Contents: Read and write` permission for this
repository. The token is stored only in that browser.

## Allocation

Green availability means preferred. Yellow availability means willing to play if
it helps fill the court. A yellow player is allocated automatically unless that
would make them play twice on the same day, in which case the Admin allocation
screen shows them as needing confirmation.

In Admin Allocation, each unfilled player position has an `Add player` button.
The button opens a player picker inside that game, so manual changes remain
visible even when the organiser has scrolled down the allocation list.
