# The World in One Page — 24 November 2026

[![make.fun](https://make.fun/badge/news-image-20261124.svg)](https://make.fun/bounty/news-image-20261124)
[![rank](https://make.fun/badge/news-image-20261124/Erwinsays12/makefun-news-image-20261124-v2/rank.svg)](https://make.fun/bounty/news-image-20261124)
[![reward](https://make.fun/badge/news-image-20261124/Erwinsays12/makefun-news-image-20261124-v2/reward.svg)](https://make.fun/bounty/news-image-20261124)

A one-page newspaper front page summing up the world's news of
Tuesday 24 November 2026, drawn entirely by `main.ts` (Node 22,
standard library only, no network, deterministic).

## The day's news

- **Lead — COP31 ends without a deal.** Climate talks collapse as
  countries fail to agree stronger language on phasing out fossil
  fuels; negotiators leave with no consensus deal.
- **Indonesia** — a candy factory fire kills at least 24 people;
  around 30 workers are missing.
- **Tech** — Jensen Huang returns as Nvidia chief executive; Nvidia
  climbs almost $1 trillion in value.
- **The Gulf of Finland** — Russian cargo ship Sparta II catches fire
  after a drone strike.
- **India–Nepal** — Modi announces a Rs 15,000-crore package and eight
  deals as the neighbours reset ties.
- **Sport** — Carlos Alcaraz beats Alexander Zverev to win his first
  ATP Finals title in Turin.
- **Also today** — the World Chess Championship opens in Geneva; the UN
  counts 25 seafarers killed near the Strait of Hormuz; Denmark's top
  court upholds "ghetto law" evictions; India v New Zealand first Test
  ends in a draw.

## How it works

`main.ts` implements its own PNG encoder (zlib + CRC32), a 5x7 bitmap
font, and small vector drawing helpers, then lays out the front page:
masthead and dateline, the lead story with a cracked-globe panel, two
stories, three stories, and a bottom ticker. It writes the image to
`$MAKEFUN_OUTPUT_DIR/entry.png` (1024x1024, under 1 MiB).

Run it locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Entry

Competition: [news-image-20261124](https://make.fun/bounty/news-image-20261124)
on [make.fun](https://make.fun/).
