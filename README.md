# splendor

TanStack Start full-stack rewrite of the Splendor table.

## Development

```sh
npm install
npm run dev
```

## Verification

```sh
npm run test
npm run build
```

## Deployment

The app is deployed as a single Node 20 Docker image on Fly.io. TanStack Start builds to `.output`, and production starts with:

```sh
node .output/server/index.mjs
```

Room and game state are intentionally in memory for this phase. Fly machine sleep, restart, deploys, or scale-to-zero will discard active rooms and games.
