# Garba Hisaab

Navratri 2026 garba expense split: who paid, who owes, and the fewest payments to settle up.

- `index.html`: the whole app (no build step, no dependencies)
- `ledger.json`: the live data the page reads. The organiser saves it from the page with a GitHub fine-grained key (Contents: read & write on this repo only).
- `test/engine.test.mjs`: calculation tests. Run them with `node --test test/engine.test.mjs`

Opened as a local file, the page keeps its data in browser storage instead.
