# quicknews.hu

Magyar nyelvű AI-híroldal: a legfontosabb nemzetközi AI-forrásokból gyűjti a híreket, magyarul foglalja össze őket, és a kész statikus oldalt a Vercelre teszi ki. Élőben: https://quicknews.hu

Ebben a repóban a kész weboldal (`site/`) és a magyar cikkek (`data/cikkek/`) olvashatók. A gyűjtő és fordító kód (`build/`), a nyers forrásszövegek és a beállítások [git-crypt](https://github.com/AGWA/git-crypt)-tel titkosítva vannak, kulcs nélkül nem olvashatók.

A frissítést a GitHub Actions végzi (`.github/workflows/frissites.yml`), az indítást egy Cloudflare Worker adja negyedóránként (`indito/`).
