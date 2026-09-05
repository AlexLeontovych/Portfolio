# -*- coding: utf-8 -*-
"""
Read the balance out of the game's own tables and say whether a level is
winnable, and by how much.

Usage:
    python scripts/td_balance.py [casual|normal|veteran]

Nothing here is a simulation of the board. It answers two questions a
tower-defense level lives or dies by: how much damage does the wave demand,
and how much can the gold the wave pays out buy? A level where the second
never catches the first is unwinnable however well it is played; one where
it runs far ahead is over before it starts.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNITS = os.path.join(ROOT, "src", "components", "td", "units.ts")
LEVELS = os.path.join(ROOT, "src", "components", "td", "levels.ts")


def read(path):
    return open(path, encoding="utf-8").read()


def creeps():
    src = read(UNITS)
    body = src[src.index("export const CREEPS"):src.index("/* --------------------------------- towers")]
    out = {}
    for m in re.finditer(r"(\w+): \{(.*?)\n  \},", body, re.S):
        name, block = m.group(1), m.group(2)
        def num(k, d=0.0):
            mm = re.search(k + r":\s*([0-9.]+)", block)
            return float(mm.group(1)) if mm else d
        out[name] = dict(hp=num("hp"), speed=num("speed"), armour=num("armour"),
                         resist=num("resist"), gold=num("gold"), leak=num("leak"),
                         boss="boss: true" in block, flying="flying: true" in block)
    return out


def towers():
    src = read(UNITS)
    body = src[src.index("export const TOWERS"):src.index("/** Selling never refunds")]
    out = {}
    for m in re.finditer(r"^  (\w+): \{(.*?)\n  \},", body, re.S | re.M):
        name, block = m.group(1), m.group(2)
        tiers = []
        for t in re.finditer(r"\{ cost: (\d+), damage: (\d+), reload: ([0-9.]+), range: (\d+)(.*?)\}", block):
            tiers.append(dict(cost=int(t.group(1)), damage=int(t.group(2)),
                              reload=float(t.group(3)), range=int(t.group(4))))
        kind = "magic" if '"magic"' in block else "physical"
        out[name] = dict(kind=kind, tiers=tiers, blocks="blocks: true" in block,
                         air="hitsAir: true" in block)
    return out


def difficulties():
    src = read(UNITS)
    body = src[src.index("export const DIFFICULTIES"):]
    out = {}
    for m in re.finditer(r"(\w+): \{ name: \"[^\"]+\", lives: (\d+), gold: (\d+), hp: ([0-9.]+), "
                         r"gold_rate: ([0-9.]+), prep: (\d+), stars: (\d+) \}", body):
        out[m.group(1)] = dict(lives=int(m.group(2)), gold=int(m.group(3)), hp=float(m.group(4)),
                               rate=float(m.group(5)))
    return out


def levels():
    src = read(LEVELS)
    out = []
    import re as _re
    for block in src.split("    name: \"")[1:]:
        name = block[:block.index('"')]
        hm = _re.search(r"^    hp: ([0-9.]+),", block, _re.M)
        scale = float(hm.group(1)) if hm else 1.0
        waves = []
        for wm in re.finditer(r"w\((.*?)\),\n", block, re.S):
            groups = re.findall(r"creep: \"(\w+)\", count: (\d+)", wm.group(1))
            if groups:
                waves.append([(g[0], int(g[1])) for g in groups])
        if waves:
            out.append((name, waves, scale))
    return out


def hit(raw, kind, c):
    """The engine's applyDamage, so the numbers here are the game's."""
    if kind == "magic":
        return raw * (1 - c["resist"])
    return max(raw * FLOOR, raw - c["armour"])


FLOOR = 0.35


def main():
    C, T, D, L = creeps(), towers(), difficulties(), levels()
    pads = json.load(open(os.path.join(ROOT, "art-src", "td", "maps.json"), encoding="utf-8"))
    order = ["oasis", "canyon", "crystal", "frost", "forge"]
    diff = D[sys.argv[1] if len(sys.argv) > 1 else "normal"]

    # what a tower actually does per second to each creep, per gold spent
    print("effective dps per 100 gold, tier 1 towers, by creep")
    names = [n for n in C if not C[n]["boss"]]
    head = "  " + "tower    " + "".join(f"{n[:9]:>10}" for n in names)
    print(head)
    for tn, t in T.items():
        if not t["tiers"] or t["blocks"]:
            continue                       # the barracks does not shoot
        tier = t["tiers"][0]
        row = f"  {tn:9}"
        for n in names:
            dps = hit(tier["damage"], t["kind"], C[n]) / tier["reload"]
            row += f"{dps / tier['cost'] * 100:10.1f}"
        print(row)

    print("\nper level, on", sys.argv[1] if len(sys.argv) > 1 else "normal")
    print("  level                 creeps    raw HP   armoured HP   gold in   HP per gold   what it buys")
    for i, (name, waves, scale) in enumerate(L):
        n = raw = eff = gold = 0
        for w in waves:
            for cn, count in w:
                c = C[cn]
                n += count
                raw += count * c["hp"] * diff["hp"] * scale
                # what an archer tier 1 has to chew through: the same shots,
                # blunted by armour, is the honest measure of a wave's weight
                blunt = tier_effect(c, T)
                eff += count * c["hp"] * diff["hp"] * scale / blunt
                gold += count * c["gold"] * diff["rate"]
        purse = diff["gold"] + gold
        # what that purse builds on this map: fill every pad, then upgrade
        k = len(pads[order[i]]["plots"]) if i < len(order) else 9
        shoot = [t for t in T.values() if t["tiers"]]
        t1 = sum(t["tiers"][0]["cost"] for t in shoot) / len(shoot)
        t2 = sum(t["tiers"][1]["cost"] for t in shoot) / len(shoot)
        t3 = sum(t["tiers"][2]["cost"] for t in shoot) / len(shoot)
        fill, up2, up3 = k * t1, k * t2, k * t3
        if purse < fill:
            built = f"{purse / t1:.0f}/{k} pads, no upgrades"
        elif purse < fill + up2:
            built = f"all {k} pads, {(purse - fill) / t2:.0f} at tier 2"
        elif purse < fill + up2 + up3:
            built = f"all {k} at tier 2, {(purse - fill - up2) / t3:.0f} at tier 3"
        else:
            built = f"all {k} maxed, {purse - fill - up2 - up3:.0f} to spare"
        import math as _m
        road_len = sum(_m.dist(pads[order[i]]["road"][j], pads[order[i]]["road"][j + 1])
                       for j in range(len(pads[order[i]]["road"]) - 1)) if i < len(order) else 1200
        r, wi, whp, have, secs = hardest(waves, C, T, diff, scale, road_len, purse, k)
        print(f"  {i+1} {name:18} {n:5}  {raw:9.0f}   {eff:11.0f}  {purse:8.0f}   "
              f"{eff/purse:7.1f}   {built}")
        print(f"      hardest wave {wi}: needs {whp:7.0f} damage, "
              f"{k} tier-2 towers deliver {have:7.0f} in {secs:4.0f}s  -> margin x{r:.2f}")


def hardest(waves, C, T, diff, scale, road, purse, pads):
    """
    The worst wave, against what the purse can have shooting by then.

    A wave is survivable if the towers can put its health down in the time
    it takes to walk the road. Both sides are rough — the towers do not all
    reach every creep, and the player will not have spent perfectly — so
    what matters is the ratio, and whether it is the same shape from level
    to level.
    """
    shoot = [t for t in T.values() if t["tiers"] and not t["blocks"]]
    best = None
    for wi, w in enumerate(waves):
        hp = span = 0.0
        slowest = 999.0
        for cn, count in w:
            c = C[cn]
            eff = sum(hit(t["tiers"][1]["damage"], t["kind"], c) / t["tiers"][1]["damage"]
                      for t in shoot) / len(shoot)
            hp += count * c["hp"] * diff["hp"] * scale / max(eff, 0.05)
            span = max(span, count * 1.0)
            slowest = min(slowest, c["speed"])
        seconds = span + road / slowest
        # by the last waves the map is built: tier 2 everywhere it can afford
        dps = sum(t["tiers"][1]["damage"] / t["tiers"][1]["reload"] for t in shoot) / len(shoot)
        reach = sum(t["tiers"][1]["range"] for t in shoot) / len(shoot)
        # a tower only fires while a creep is inside its circle, so what the
        # map delivers depends on how much of the road the pads between them
        # can see — a long serpentine is harder than a short loop with the
        # same number of plots on it
        covered = min(1.0, pads * 1.7 * reach / road)
        have = pads * dps * seconds * covered
        ratio = have / hp
        if best is None or ratio < best[0]:
            best = (ratio, wi + 1, hp, have, seconds)
    return best


def tier_effect(c, T):
    """How much of a plain archer's damage lands on this creep, 0..1."""
    a = T["archer"]["tiers"][0]
    return max(0.05, hit(a["damage"], "physical", c) / a["damage"])


if __name__ == "__main__":
    main()
