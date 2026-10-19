# Potato Region

Aida's Potato Region is a quiet farming game for an iPad Home Screen. Grow colourful potatoes, trade them, dress up, and fill your house.

**Live:** https://gulcin.github.io/potato-region/
**Version:** 1.1.2

## Play together on two phones

1. Open Potato Region on both phones (Safari, or the Home Screen icon).
2. On the first phone, tap **Play together**, tap **Mum** (or type a name), then **Start a farm party**.
3. Show the other phone the four pictures, the four numbers, or the QR code.
4. On the second phone, tap **Play together**, then **Join**. Type the number, or tap **Scan**. You can also open the QR link.
5. Walk, plant, water, and pick on the same farm. Tap the heart, the wave, or the potato dance. Tap **Alone** to go back to your own game. Your clothes, pet, house, and potatoes stay on your phone.

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
