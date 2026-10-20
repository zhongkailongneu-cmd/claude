"""Where things appear, in (bar, beat). The score adds a tick on every text
entry and an impact on every card change; the picture animates on the same
beats."""

from timeline import PART1_START, REGION_BARS, PART2_START, PFC_BARS

N_REGIONS = 12
N_PFC = 7


def region_start(i):
    return PART1_START + i * REGION_BARS


def pfc_start(j):
    return PART2_START + j * PFC_BARS


def text_entries():
    """(bar, beat) of every line of text that pops in, for the tick sound."""
    out = []
    for i in range(N_REGIONS):
        b = region_start(i)
        out += [(b, 1), (b, 2), (b, 3), (b + 1, 0)]
    for j in range(N_PFC):
        b = pfc_start(j)
        out += [(b, 1), (b, 2), (b, 3), (b + 4, 1), (b + 5, 1)]
    return out


def card_changes():
    """Downbeats where a new card begins (impact + flash)."""
    out = [region_start(i) for i in range(N_REGIONS)]
    out += [pfc_start(j) for j in range(N_PFC)]
    return out


def page_flips():
    """Second page of each PFC card (reverse swell into a light hit)."""
    return [pfc_start(j) + 4 for j in range(N_PFC)]


# outro words land on beats 1 and 3 of bars 128-129, the final line on bar 130
OUTRO_WORDS = [(128, 0), (128, 2), (129, 0), (129, 2)]
OUTRO_FINAL = 130
NETWORK_STEPS = [120, 122, 124, 126]
