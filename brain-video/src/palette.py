"""Loyel 2025 gradient-blue palette. These ten values (plus white text on the
darkest tones) are the only colors used anywhere in the video."""

L10 = "#F4F7FB"
L20 = "#E8EEF6"
L30 = "#CCDBEB"
L40 = "#9FBDDA"
L50 = "#6C9AC4"
L60 = "#497DAE"
L70 = "#376392"
L80 = "#2E5076"
L90 = "#2B4868"
L100 = "#263B54"
WHITE = "#FFFFFF"


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgbf(hex_color):
    return tuple(c / 255.0 for c in rgb(hex_color))


def rgba(hex_color, a=255):
    return rgb(hex_color) + (int(a),)
