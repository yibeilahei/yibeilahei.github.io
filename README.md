# Lazahata

Browser-only EPUB → XTCH converter for Xteink / CrossPoint e-readers. Next.js app that **exports a static site** — no server, no uploads.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:3000

```bash
npm test
```

## Build a static site

```bash
npm run build
```

Output is written to `out/`. Preview it with:

```bash
npm start
```

## Deploy

Any static host can serve `out/`.

- **Netlify** — `netlify.toml` already points `publish` at `out` and runs `npm run build`.
- **GitHub Pages** — `.github/workflows/deploy.yml` builds and publishes `out/` on push to `main`. Enable Pages with the “GitHub Actions” source. Project sites (`username.github.io/repo`) get `basePath` automatically.
- **Cloudflare Pages / others** — build command `npm run build`, output directory `out`.
- **Vercel** — `output: "export"` in `next.config.ts` produces a static deployment.

Override the public path with `NEXT_PUBLIC_BASE_PATH` if the site is not at `/`.
