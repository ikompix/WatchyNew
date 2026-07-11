# Watchy — Logo (minimaliste, cadrans empilés)

Trois cadrans échelonnés (idée de collection) avec aiguilles sur le cadran avant. Vectoriel + PNG à toutes les tailles.

## Fichiers sources (SVG)
- `watchy-mark.svg` — la marque seule (séparations blanches entre cadrans → à poser sur fond clair). viewBox 0 0 72 64.
- `watchy-icon-appstore.svg` — icône **carré plein blanc 1024**, sans transparence → App Store (iOS masque les coins).
- `watchy-icon-rounded.svg` — icône **coins arrondis, transparent** → web, PWA, maquettes.

## PNG générés
- `mark-png/` — marque : 512, 256, 128, 96, 64, 48, 32.
- `icon-appstore-png/` — App Store (blanc plein) : 1024, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20.
- `icon-rounded-png/` — favicon / PWA : 512, 192, 180, 167, 152, 120, 87, 76, 64, 48, 32, 16.
- `AppIcon.appiconset/` — à glisser dans `Assets.xcassets` (Xcode 14+, single-size 1024).

## Palette
| Rôle | Hex |
|---|---|
| Cadran avant | `#4C6FFF` |
| Cadran milieu | `#6E7CFF` |
| Cadran arrière | `#B9C4FF` |
| Aiguilles / séparations | `#FFFFFF` |
| Wordmark « watchy » | `#16182B` |

Police du wordmark : géométrique (Space Grotesk / équivalent), casse bas, weight 500.

## Régénérer les PNG
```bash
rsvg-convert -w 1024 -h 1024 watchy-icon-appstore.svg -o out-1024.png
magick -background none watchy-mark.svg -resize 512x watchy-mark-512.png
```
L'icône App Store ne doit **pas** avoir de transparence ni de coins pré-arrondis → variante `-appstore`. Les séparations blanches font partie du dessin : sur fond sombre, utiliser l'icône (fond blanc) plutôt que la marque nue.
