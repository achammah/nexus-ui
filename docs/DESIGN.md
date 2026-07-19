# DESIGN — the library's visual lock

**The lock for this LIBRARY is the token canvas itself:** `src/tokens/tokens.css` (the `--nx-*` set) + `src/styles/shadcn.css` (the bridge deriving every vendored component from it). Components never carry their own colors/sizes — a change of look is a change of tokens, nowhere else.

Locked baseline (v0.x default canvas): warm near-neutrals (`#fafaf9` / `#1c1b19`, hue-biased, never pure grey) · single indigo accent `#4f46e5` with semantic ok/warn/danger kept separate · system sans, 13px body, tabular numerals in data · radii 6/9/14 · restrained motion (120/200ms, zero ambient, reduced-motion honored) · light + dark first-class (`[data-theme]` beats the OS query both ways).

**Per-APP locks live in the app** (starter `docs/DESIGN.md`, chosen at P0.5 from rendered direction boards) and restyle this entire kit by overriding tokens — never by editing components (vendored files are overwrite-on-revendor by contract, AGENTS.md).
