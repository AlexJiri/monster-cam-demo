# Recorded sounds

The game plays a recorded sound when this folder has one, and makes it procedurally otherwise, so any sound can be added on its own. Several files for one sound are fine: a random one plays each time, a little faster or slower each time.

## How to add one

1. Download a file (mp3, ogg or wav; keep it short and trim the silence at the start).
2. Put it here, named after the sound: `click-1.mp3`, `click-2.mp3`, …
3. List it in `sounds.json`:

```json
{
  "click": ["click-1.mp3", "click-2.mp3"],
  "hoho": ["hoho-1.mp3"]
}
```

## Licence: only free sounds that need no credit

- **Freesound**: only files marked **Creative Commons 0** (CC0). The links below already filter for it.
- **Pixabay** sound effects: free for commercial use, no credit needed.

Keep the page link of every file you use in `SOURCES.md` here, in case anyone asks where a sound came from.

## The sounds

| Name | What it is | Freesound (CC0) | Pixabay |
|---|---|---|---|
| `click` | the lantern switching on | [search](https://freesound.org/search/?q=flashlight+switch+click&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/flashlight-click/) |
| `step` | a heavy footstep (Hunter; Santa plays it slower and deeper) | [search](https://freesound.org/search/?q=heavy+footstep+wood&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/heavy-footstep/) |
| `hoof` | one hoof on a hard floor (Krampus, Rudolf) | [search](https://freesound.org/search/?q=hoof+step&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/hoof/) |
| `bells` | a short jingle of sleigh bells | [search](https://freesound.org/search/?q=sleigh+bells+jingle+short&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/sleigh-bells/) |
| `drag` | a body dragged on the floor (Zombie) | [search](https://freesound.org/search/?q=body+drag+floor&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/body-drag/) |
| `growl` | a low monster growl, 1–2 s | [search](https://freesound.org/search/?q=monster+growl+low&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/monster-growl/) |
| `caught` | the scream/roar when the monster gets you | [search](https://freesound.org/search/?q=monster+roar+scream&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/monster-scream/) |
| `hoho` | a deep, evil "ho ho ho" | [search](https://freesound.org/search/?q=ho+ho+ho+santa&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/ho-ho-ho/) |
| `groan` | a zombie moan | [search](https://freesound.org/search/?q=zombie+moan&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/zombie-groan/) |
| `snort` | a horse/deer snort | [search](https://freesound.org/search/?q=horse+snort&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/horse-snort/) |
| `thud` | a heavy sack hitting something (Santa's attack) | [search](https://freesound.org/search/?q=heavy+bag+thud+punch&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/thud/) |
| `crack` | glass cracking (Rudolf's attack) | [search](https://freesound.org/search/?q=glass+crack&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/glass-crack/) |
| `heartbeat` | one heartbeat thump (the last half minute) | [search](https://freesound.org/search/?q=heartbeat+single&f=license%3A%22Creative+Commons+0%22) | [search](https://pixabay.com/sound-effects/search/heartbeat/) |
