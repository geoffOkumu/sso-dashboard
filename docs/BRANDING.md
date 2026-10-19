# Permit Kit branding

The supplied source logo is `public/logo.png`. The shared `Brand` component uses
`public/brand/mark.png` alongside the product name on both light and dark surfaces.

Theme tokens live in `app/globals.css`: primary blue `#084bff`, ink `#0b0e1a`,
soft blue `#eef3ff`, blue border `#d5e0ff`, and light blue `#a9c1ff`.

## Assets

- `app/favicon.ico`: 16, 32, and 48 pixel browser icons.
- `app/icon.png`: transparent 512 pixel app icon.
- `app/apple-icon.png`: 180 pixel Apple touch icon on white.
- `app/opengraph-image.png`: default 1200 × 630 social preview.
- `app/twitter-image.png`: matching large Twitter card.
- Companion `.alt.txt` files provide social preview descriptions.

Next.js discovers these assets through its file-based metadata conventions.
`app/layout.tsx` sets the site name, theme color, and social metadata. Absolute
image URLs use the deployment's `BETTER_AUTH_URL` origin.

`PRODUCT_NAME` defaults to Permit Kit and retains its deployment override.
Existing database names and authentication cookie identifiers remain unchanged
for installation and session compatibility.

## Asset generation

The logo mark was extracted with the built-in imagegen tool using the supplied
logo as the edit target and transparency enabled. It was exported to icon sizes
with Sharp. The social preview was composed with Next.js `ImageResponse` using
the extracted mark, product name, theme palette, and the existing sign-in copy.

Imagegen prompt:

> Extract ONLY the blue P/checkmark logo symbol on the LEFT of this supplied Permit Kit logo. Remove all wordmark lettering and white background. Faithfully preserve the precise original P silhouette and checkmark cutout, proportions and vivid royal blue (#064bff approximate); clean flat brand asset, no redesign, no new elements, no shadows, no texture. Output a square transparent PNG with the mark centered and filling about 85% of the canvas. The white negative space inside the symbol must be transparent too. This is for production favicons and a navigation logo. Input image is the edit target.
