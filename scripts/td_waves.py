# -*- coding: utf-8 -*-
"""
Can each wave be killed by what the player can have built by the time it
arrives?

The level-wide numbers in td_balance.py weigh a whole level against a whole
level and say every map is winnable. They missed a map opening with twelve
elite goblins against the two towers the starting purse buys: nothing died,
and no amount of skill would have changed that.

This walks the waves in order. At each one it spends everything earned so far
the way a player does — fill the plots, then upgrade them — and asks whether
one creep, walking the whole road past all of it, dies. A wave that fails
that cannot be held however well it is played.

Both sides are deliberately plain: one kind of tower, no blockers, no splash,
perfect aim. It is a floor, not a prediction. What matters is that no wave
falls under it and that the margin shrinks from map to map.

Usage:
    python scripts/td_waves.py [casual|normal|veteran]
"""
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_balance as B                                     # noqa: E402

ORDER = ["oasis", "canyon", "crystal", "frost", "forge"]


def built(purse, pads, tiers):
    """How the purse ends up spent: fill the plots, then upgrade them."""
    out = []
    fill = min(pads, int(purse // tiers[0]["cost"]))
    purse -= fill * tiers[0]["cost"]
    out = [0] * fill
    for step in (1, 2):
        for i in range(len(out)):
            if out[i] == step - 1 and purse >= tiers[step]["cost"]:
                purse -= tiers[step]["cost"]
                out[i] = step
    return out


def main():
    C, T, D, L = B.creeps(), B.towers(), B.difficulties(), B.levels()
    maps = json.load(open(os.path.join(B.ROOT, "art-src", "td", "maps.json"), encoding="utf-8"))
    src = open(os.path.join(B.ROOT, "src", "components", "td", "levels.ts"), encoding="utf-8").read()
    extra = []
    for block in src.split('    name: "')[1:]:
        m = re.search(r"^    gold: (\d+),", block, re.M)
        extra.append(int(m.group(1)) if m else 0)

    which = sys.argv[1] if len(sys.argv) > 1 else "normal"
    diff = D[which]
    archer = T["archer"]["tiers"]

    print(f"every wave against the purse it arrives with, on {which}")
    print("  a creep must die walking the road once past a plainly spent map\n")
    worst_overall = None
    for i, (name, waves, scale) in enumerate(L):
        road = maps[ORDER[i]]["road"]
        length = sum(math.dist(road[j], road[j + 1]) for j in range(len(road) - 1))
        pads = len(maps[ORDER[i]]["plots"])

        purse = diff["gold"] + extra[i]
        rows = []
        for wi, w in enumerate(waves):
            towers = built(purse, pads, archer)
            for cn, count in w:
                c = C[cn]
                hp = c["hp"] * diff["hp"] * scale
                dmg = 0.0
                for tier in towers:
                    t = archer[tier]
                    seconds = min(2 * t["range"], length) / c["speed"]
                    dmg += B.hit(t["damage"], "physical", c) / t["reload"] * seconds
                rows.append((wi + 1, cn, count, hp, len(towers), dmg, dmg / hp))
            for cn, count in w:
                purse += count * C[cn]["gold"] * diff["rate"]

        tight = min(rows, key=lambda r: r[6])
        dead = [r for r in rows if r[6] < 1.0]
        wi, cn, count, hp, n, dmg, ratio = tight
        flag = f"   <-- {len(dead)} unkillable" if dead else ""
        print(f"  {i+1} {name:18} tightest wave {wi:2}: {count:3} x {cn:13} "
              f"{hp:6.0f} hp | {n:2} towers do {dmg:7.0f} | x{ratio:5.2f}{flag}")
        if worst_overall is None or ratio < worst_overall:
            worst_overall = ratio
    print(f"\n  thinnest margin anywhere: x{worst_overall:.2f}")


if __name__ == "__main__":
    main()
