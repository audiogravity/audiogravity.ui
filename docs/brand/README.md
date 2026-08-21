# Third-party brand artwork — sources

Original files supplied by their owners, kept for provenance. **Not served**: they
live outside `public/`, so no build copies them and no URL exposes them.

## HIGHRESAUDIO

`HRA_Logo_POSITIV_RZ.jpg` · `HRA_Logo_NEGATIV_RZ.jpg` — supplied by HIGHRESAUDIO
alongside their streaming API, as the reference for their corporate identity.

The interface ships `public/pics/hra-logo-light.webp` and `hra-logo-dark.webp`,
derived from these two: the flat background (`#ffffff` and `#3d3d45`) is made
transparent and the image is scaled to 164×120. The drawing, its proportions and its
colours are untouched. Transparency is not a nicety here — Audiogravi<sup>ty</sup>
has six theme backgrounds, and a flat one matches exactly one of them, so the
unmodified files paint a rectangle over the interface on the other five.

Regenerating them is a background key on the corner colour, a crop to the artwork
bounds, then a resize. Watch for the one-pixel border both JPEGs carry in a colour
close to (but not equal to) their background: left in, it survives the key and draws
a faint full-width line under the mark.

If HIGHRESAUDIO supplies a transparent SVG or PNG, prefer it and delete the derived
files — an official asset always beats one we produced.
