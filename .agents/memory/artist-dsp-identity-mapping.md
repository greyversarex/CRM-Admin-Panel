---
name: Artist DSP identity mapping
description: How artist Spotify/Apple profile selection works and how it reaches Broma16
---
- Quick Create Artist dialog (release wizard) searches DSP profiles by name: Spotify via client-credentials (needs Spotify integration keys), Apple via free iTunes Search API `entity=musicArtist` (no avatar/followers), Deezer via free keyless `api.deezer.com/search/artist` (avatar+fans). Endpoint GET /artists/dsp-search returns typed status ok/not_configured/error per platform.
- Deezer has NO legacy column — its pick is merged into `broma16Outlets` client-side by matching the outlet dictionary name (`/^deezer/i`); requires the Broma16 outlet dictionary to be synced.
- VK/Yandex/Zvuk/YouTube have no official APIs → step 2 has a paste-URL field: `parseArtistUrl` extracts the ID from the profile URL and maps to a dictionary outlet by name regex (beware "Youtube Content ID" vs "Youtube, Youtube Music"). Outlets deduped by outletId before create.
- Broma16 ROD has NO DSP-profile search endpoint — its `/artist/searche` searches only Broma's internal artist catalog. Broma's panel feature uses their own Spotify keys server-side; cannot be borrowed via ROD.
- **Push contract:** artists.spotify_id/apple_id are merged into the Broma16 artist `outlets` payload in buildArtistOutlets (services/broma16/artists.ts) by matching outlet dictionary names ("spotify" / "apple"/"itunes"). Explicit broma16Outlets rows take priority (dedup by outlet_id).
- **Why:** without this merge, wizard-selected profiles were stored locally but never delivered — releases could land on wrong artist pages.
