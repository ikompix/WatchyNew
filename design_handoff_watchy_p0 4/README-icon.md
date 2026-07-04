# Watchy — App Icon

Icône neumorphique (cadran nacré, aiguilles bleu ardoise / navy). Fournie en **SVG vectoriel** + **PNG** à toutes les tailles iOS.

## Fichiers

- `watchy-icon.svg` — version **squircle avec ombre portée**, fond transparent. Pour maquettes, site web, marketing, presse.
- `watchy-icon-appstore.svg` — version **carré plein 1024×1024, sans transparence**. C'est celle à soumettre : iOS applique lui-même le masque arrondi.
- `icon-png/` — PNG de la version squircle (fond transparent).
- `icon-appstore-png/` — PNG carrés pleins prêts pour l'App Store / le catalogue d'assets Xcode.
- `AppIcon.appiconset/` — jeu d'assets Xcode prêt à glisser dans `Assets.xcassets`.

## Palette

| Rôle              | Hex       |
|-------------------|-----------|
| Corps / cadran    | `#ffffff` → `#c8cfda` (dégradé radial) |
| Aiguille heure    | `#3f6389` (bleu ardoise) |
| Aiguille minute   | `#1b2531` (navy) |
| Point central     | `#5b7fa6` |

## Tailles générées

`1024, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20` px.

## Régénérer les PNG depuis le SVG

```bash
# via rsvg-convert
rsvg-convert -w 1024 -h 1024 watchy-icon-appstore.svg -o watchy-1024.png

# ou via ImageMagick
magick -background none watchy-icon-appstore.svg -resize 1024x1024 watchy-1024.png
```

L'icône App Store ne doit **pas** contenir de transparence ni de coins arrondis — utiliser la variante `-appstore`.
