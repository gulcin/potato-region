# Potato Region

Aida's Potato Region is a quiet farming game for an iPad Home Screen. Grow colourful potatoes, trade them, dress up, and fill your house.

**Live:** https://gulcin.github.io/potato-region/
**Version:** 1.0.0

## Play on this computer

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/potato-region/

## Sanity suite

The browser checks need Pillow for the Home Screen splash images.

```bash
python3 -m pip install pillow
npm run test:e2e
```

The suite plays every farm, every shop item, every outfit, every pet, and the house. It also checks Tell us, grown-ups, and the update banner on iPad portrait, iPad landscape, and iPhone portrait.
