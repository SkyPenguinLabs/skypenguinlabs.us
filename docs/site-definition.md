# Production Site Definition

`site.definition.json` is the repository-level contract for the static site. It defines the deployment root, brand constants, required assets, live routes, legacy routes, and planned routes.

The production rule is simple: only `live` and `legacy` routes should be linked from rendered pages. `planned` routes can stay in the definition so the roadmap is visible, but they should not appear in navigation or footer chrome until a real page exists under `public/`.

Run `npm run build` before deploy. For these static Cloudflare Pages projects, the build currently validates the definition, Pages headers and redirects, required assets, live route files, and local links.
