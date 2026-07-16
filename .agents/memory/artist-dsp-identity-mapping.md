---
name: Artist DSP identity mapping
description: How artist Spotify/Apple profile selection works and how it reaches Broma16
---
- Quick Create Artist dialog (release wizard) searches DSP profiles by name: Spotify via client-credentials (needs Spotify integration keys), Apple via free iTunes Search API `entity=musicArtist` (no avatar/followers). Endpoint GET /artists/dsp-search returns typed status ok/not_configured/error per platform.
- Broma16 ROD has NO DSP-profile search endpoint — its `/artist/searche` searches only Broma's internal artist catalog. Broma's panel feature uses their own Spotify keys server-side; cannot be borrowed via ROD.
- **Push contract:** artists.spotify_id/apple_id are merged into the Broma16 artist `outlets` payload in buildArtistOutlets (services/broma16/artists.ts) by matching outlet dictionary names ("spotify" / "apple"/"itunes"). Explicit broma16Outlets rows take priority (dedup by outlet_id).
- **Why:** without this merge, wizard-selected profiles were stored locally but never delivered — releases could land on wrong artist pages.
