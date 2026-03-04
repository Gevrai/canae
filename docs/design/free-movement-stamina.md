# Free Movement & Stamina System — Design Document

> **Game:** Canae — Real-Time Wargame (Phaser.js + TypeScript)
> **Map:** 1920 × 1280 px (30 × 20 tiles @ 64 px each)
> **Status:** Draft — replaces grid-based tile movement with continuous real-time movement

---

## Table of Contents

1. [Movement Speeds](#1-movement-speeds)
2. [Stamina System](#2-stamina-system)
3. [Cavalry Charge](#3-cavalry-charge)
4. [Infantry Brace](#4-infantry-brace)
5. [Archer Proximity Defense](#5-archer-proximity-defense)
6. [Terrain Effects](#6-terrain-effects)
7. [Unit Collision](#7-unit-collision)
8. [Range & Distance](#8-range--distance)
9. [UI Changes](#9-ui-changes)
10. [Combat Modifiers Summary](#10-combat-modifiers-summary)

---

## 1. Movement Speeds

Units move continuously in any direction at a **base speed** measured in pixels per second. There are no movement budgets or turn cooldowns — a unit moves for as long as the player commands it to and it has stamina remaining.

### Base Speeds

| Unit Type | Base Speed (px/s) | Map Traverse Time (diagonal ≈ 2304 px) |
|-----------|-------------------|----------------------------------------|
| Infantry  | 80                | ~29 s                                  |
| Cavalry   | 160               | ~14 s                                  |
| Archer    | 96                | ~24 s                                  |

**Design rationale:** Cavalry is exactly 2× infantry speed, matching the existing `speed` ratio (2.0 vs 1.0). Archers are 1.2× infantry, matching their current `speed: 1.2`. At 80 px/s an infantry unit crosses the full map width (1920 px) in 24 seconds — slow enough for tactical play, fast enough to stay engaging. Cavalry can flank in roughly 10–12 seconds across the map width.

### Terrain Speed Modifiers

Terrain applies a **speed multiplier** to the base speed:

```
effectiveSpeed = baseSpeed × terrainSpeedMultiplier
```

| Terrain | Speed Multiplier | Infantry Effective | Cavalry Effective | Archer Effective |
|---------|------------------|--------------------|-------------------|------------------|
| Plains  | 1.0              | 80 px/s            | 160 px/s          | 96 px/s          |
| Road    | 1.3              | 104 px/s           | 208 px/s          | 125 px/s         |
| Hills   | 0.65             | 52 px/s            | 104 px/s          | 62 px/s          |
| Forest  | 0.55             | 44 px/s            | 88 px/s           | 53 px/s          |
| Mud     | 0.50             | 40 px/s            | 80 px/s           | 48 px/s          |
| Water   | 0 (impassable)   | —                  | —                 | —                |

### Exhaustion Slowdown

When stamina falls below 30%, movement speed is further reduced:

```
if (stamina < maxStamina × 0.3) {
    speedPenalty = 0.5 + 0.5 × (stamina / (maxStamina × 0.3))
    // At 30% stamina → 1.0× (no penalty)
    // At 15% stamina → 0.75×
    // At  0% stamina → 0.5× (half speed)
    effectiveSpeed = effectiveSpeed × speedPenalty
}
```

---

## 2. Stamina System

Every unit has a **stamina bar** that depletes from movement and combat. Low stamina makes units slower, weaker in combat, and unable to trigger special abilities.

### Stamina Pool

| Unit Type | Max Stamina | Design Note                                  |
|-----------|-------------|----------------------------------------------|
| Infantry  | 100         | Highest — built for sustained fighting        |
| Cavalry   | 80          | Burns fast at high speed, must manage charges |
| Archer    | 70          | Lowest — repositioning is costly              |

### Stamina Drain — Movement

Stamina drains every second while the unit is moving. The drain rate scales with terrain difficulty:

```
movementDrain = baseDrainRate × terrainDrainMultiplier
```

| Unit Type | Base Drain Rate (per second while moving) |
|-----------|-------------------------------------------|
| Infantry  | 2.0                                       |
| Cavalry   | 3.0                                       |
| Archer    | 2.5                                       |

Terrain drain multipliers (see §6 for full table):

| Terrain | Drain Multiplier |
|---------|------------------|
| Road    | 0.7              |
| Plains  | 1.0              |
| Hills   | 1.8              |
| Forest  | 1.6              |
| Mud     | 2.0              |

**Example:** Cavalry moving through mud drains `3.0 × 2.0 = 6.0` stamina/s — their 80 stamina pool empties in ~13 seconds of continuous mud movement.

### Stamina Drain — Combat

| Action                          | Stamina Cost         |
|---------------------------------|----------------------|
| Melee attack (per swing)        | 5                    |
| Ranged attack (per shot)        | 3                    |
| Being attacked (per hit taken)  | 2                    |
| Cavalry charge (on impact)      | 15                   |

### Stamina Recovery

Stamina recovers passively when a unit is **stationary and not in combat**. There is a **1-second delay** after the last action before recovery begins.

| Condition                        | Recovery Rate (per second) |
|----------------------------------|----------------------------|
| Stationary, not in combat        | 4.0                        |
| Stationary, in combat            | 0 (no recovery)            |
| Moving                           | 0 (no recovery)            |
| On road, stationary              | 6.0 (1.5× bonus)          |

### How Stamina Affects Combat Stats

Low stamina degrades a unit's effectiveness:

| Stamina Level         | Attack Modifier | Defense Modifier |
|-----------------------|-----------------|------------------|
| 100%–50%              | 1.0× (full)     | 1.0× (full)      |
| 50%–25%               | 0.85×           | 0.85×            |
| 25%–10%               | 0.65×           | 0.70×            |
| Below 10%             | 0.50×           | 0.50×            |

**Formula (continuous):**

```
staminaRatio = currentStamina / maxStamina

if (staminaRatio >= 0.5) {
    staminaModifier = 1.0
} else {
    staminaModifier = 0.5 + staminaRatio  // 0.5 at 0%, 1.0 at 50%
}

effectiveAttack  = baseAttack  × staminaModifier
effectiveDefense = baseDefense × staminaModifier
```

---

## 3. Cavalry Charge

Cavalry gain a powerful damage bonus when they **move into an enemy at speed**, representing a charging lance impact.

### Trigger Conditions

All of the following must be true:

1. **Unit type** is Cavalry
2. **Current speed** ≥ 70% of base speed (≥ 112 px/s on plains)
3. **Distance traveled** toward the target in the last 1.5 seconds ≥ 128 px (2 tile-widths)
4. **Stamina** ≥ 20 (minimum to charge)
5. **Target** is within melee range (40 px) at the moment of contact

### Charge Effects

| Parameter              | Value                                  |
|------------------------|----------------------------------------|
| Damage multiplier      | 1.5× (applied on top of base damage)  |
| Stamina cost           | 15 (deducted on impact)               |
| Knockback              | Target pushed 16 px away from cavalry |
| Charge cooldown        | 4 seconds after impact                |
| Target morale penalty  | −8 morale on the charged unit          |

### Charge Angle Bonus (Flanking Charge)

The existing flank system combines with charge for devastating attacks:

| Angle of Approach      | Total Charge Multiplier          |
|------------------------|----------------------------------|
| Front (< 60°)         | 1.5× (charge only)              |
| Side (60°–120°)       | 1.5× × 1.3 = **1.95×**         |
| Rear (> 120°)         | 1.5× × 1.5 = **2.25×**         |

### Failed Charge

If the cavalry unit's speed drops below the threshold before contact (e.g., terrain change, exhaustion), the charge is cancelled — no bonus, no stamina cost, no cooldown. The unit still attacks normally.

---

## 4. Infantry Brace

Infantry can **brace for impact** by standing their ground, significantly increasing their defensive ability — especially effective against cavalry charges.

### Activation

| Parameter                | Value                                     |
|--------------------------|-------------------------------------------|
| Time stationary to activate | 2.0 seconds without moving              |
| Minimum stamina          | 15                                        |
| Visual indicator         | Shield icon above unit + subtle glow      |

### Brace Effects

| Parameter                    | Value                                          |
|------------------------------|------------------------------------------------|
| Defense multiplier           | 1.35× (35% bonus)                             |
| Anti-cavalry bonus           | Additional 1.25× vs cavalry (total 1.69× def) |
| Negates cavalry knockback    | Yes                                            |
| Cavalry charge dmg reduction | Reduces incoming charge multiplier by 0.5      |
| Stamina drain while braced   | 0.5/s (low passive drain to hold formation)    |

**Against a charging cavalry:**
- Normal charge multiplier is 1.5×
- Braced infantry reduces it to 1.0× (charge bonus is fully negated)
- Plus receives 1.69× defense — cavalry charges into braced infantry are punished

### Breaking Brace

Brace is **immediately lost** when:

- The unit moves (any movement command)
- The unit initiates an attack (defending does not break brace)
- Stamina drops below 10
- Morale drops below 30 (panic breaks formation)

After breaking, the 2-second timer restarts from zero.

---

## 5. Archer Proximity Defense

Archers are fragile on their own but gain significant survivability when positioned near friendly units, representing the protection of a battle line.

### Proximity Detection

```
friendlyRadius = 128 px  (2 tile-widths)
```

Count all friendly non-archer units within `friendlyRadius` of the archer.

### Defense Scaling

| Nearby Friendlies (non-archer) | Defense Modifier | Effective Archer Defense |
|--------------------------------|------------------|--------------------------|
| 0 (isolated)                   | 0.60× (penalty)  | 3.0                      |
| 1                              | 1.00× (baseline) | 5.0                      |
| 2                              | 1.25×            | 6.25                     |
| 3+                             | 1.40× (cap)      | 7.0                      |

**Formula:**

```
nearbyCount = countFriendlyNonArchersWithin(128px)

if (nearbyCount == 0) {
    archerDefMod = 0.6
} else {
    archerDefMod = min(1.0 + 0.2 × (nearbyCount - 1), 1.4)
}

effectiveDefense = baseDefense × archerDefMod
```

### Additional Isolation Penalty

When an archer has **zero** friendly units within `192 px` (3 tile-widths):

- Morale drains at **−3/s** (feeling exposed and vulnerable)
- Attack speed reduced by 20% (panic firing)

This encourages players to keep archers protected rather than leaving them scattered.

---

## 6. Terrain Effects

Each terrain type has two separate effects: **speed modification** and **stamina drain modification**. Terrain is sampled based on the **center point** of the unit sprite.

### Complete Terrain Table

| Terrain | Speed Mult. | Stamina Drain Mult. | Defense Bonus | Blocks LoS | Passable | Notes                       |
|---------|-------------|---------------------|---------------|------------|----------|-----------------------------|
| Plains  | 1.0         | 1.0                 | +0%           | No         | Yes      | Baseline                    |
| Road    | 1.3         | 0.7                 | +0%           | No         | Yes      | Fastest travel, low fatigue |
| Hills   | 0.65        | 1.8                 | +20%          | No         | Yes      | Slow, tiring, strong defense|
| Forest  | 0.55        | 1.6                 | +30%          | Yes        | Yes      | Slow, best cover            |
| Mud     | 0.50        | 2.0                 | +0%           | No         | Yes      | Worst terrain for movement  |
| Water   | 0.0         | —                   | —             | No         | No       | Impassable obstacle         |

### Terrain Interaction with Ranged Attacks

- **Forest**: Ranged attacks into or out of forest deal 0.7× damage (unchanged from current)
- **Hills**: Units on hills attacking downhill get +15% damage (unchanged)
- **LoS blocking**: Forest tiles block line of sight for ranged attacks; archers cannot shoot through forest

### Terrain Transition

When a unit moves between terrain types, the effect transitions **instantly** based on the terrain tile under the unit's center point. No blending or gradual transition — this keeps the system simple and predictable for the player.

---

## 7. Unit Collision

Units have a circular collision radius. They cannot overlap but should not feel "sticky" — units should gently push apart.

### Collision Radii

| Unit Type | Collision Radius | Visual Sprite Size (approx.) |
|-----------|------------------|------------------------------|
| Infantry  | 14 px            | 28 × 28 px                   |
| Cavalry   | 18 px            | 36 × 36 px                   |
| Archer    | 12 px            | 24 × 24 px                   |

### Separation Behavior

When two units overlap (distance between centers < sum of radii):

```
overlap = (radiusA + radiusB) - distance(centerA, centerB)
pushDirection = normalize(centerA - centerB)

// Each unit is pushed apart by half the overlap
unitA.position += pushDirection × (overlap / 2) × separationStrength
unitB.position -= pushDirection × (overlap / 2) × separationStrength

separationStrength = 0.8  // slight softness to avoid jitter
```

### Rules

- **Friendly units** can pass through each other with a mild push (separation force only, no blocking)
- **Enemy units** block each other — they cannot pass through and are pushed apart more aggressively (`separationStrength = 1.5`)
- **Water tiles** are hard barriers — collision pushes units back to the nearest passable tile
- **Max push per frame**: 4 px — prevents teleporting from extreme overlap correction

---

## 8. Range & Distance

All distances use **Euclidean distance** between unit center points, measured in pixels.

### Distance Definitions

| Concept              | Distance (px) | Equivalent Tiles | Notes                                |
|----------------------|---------------|------------------|--------------------------------------|
| Melee range          | 40            | 0.625            | Auto-attack when within this range   |
| Archer attack range  | 256           | 4.0              | Matches current `range: 4` tiles     |
| Archer minimum range | 48            | 0.75             | Below this, archer switches to melee |
| Auto-engage range    | 96            | 1.5              | Idle melee units auto-attack enemies |
| Sight range (infantry)| 256          | 4.0              | Matches current `sight: 4`           |
| Sight range (cavalry) | 320          | 5.0              | Matches current `sight: 5`           |
| Sight range (archer)  | 384          | 6.0              | Matches current `sight: 6`           |

### Archer Targeting

Archers fire at the **nearest enemy** within attack range (256 px) that they have **line of sight** to. If an enemy is within melee range (40 px), the archer auto-attacks in melee at reduced effectiveness (−40% attack, unchanged from current).

### Attack Speed

| Unit Type | Melee Attack Interval | Ranged Attack Interval |
|-----------|-----------------------|------------------------|
| Infantry  | 1.2 s                 | —                      |
| Cavalry   | 1.0 s                 | —                      |
| Archer    | 1.5 s (melee)         | 2.0 s (ranged)         |

---

## 9. UI Changes

### Remove

| Element                  | Reason                                              |
|--------------------------|-----------------------------------------------------|
| Grid overlay             | No longer grid-based                                |
| Reachable tile highlight | No movement budget; units can move anywhere          |
| Movement cost display    | Replaced by real-time speed feedback                 |
| "End Movement" button    | No turn phases for movement                          |
| Tile selection cursor    | Click-to-move is now point-based, not tile-based     |

### Add

| Element                     | Description                                                  |
|-----------------------------|--------------------------------------------------------------|
| **Stamina bar**             | Horizontal bar below the HP bar on each unit                 |
| **Speed indicator**         | Small text/icon showing current speed % when selected        |
| **Brace icon**              | Shield icon above infantry when brace is active              |
| **Charge trail**            | Brief motion trail behind cavalry at charge speed            |
| **Proximity rings**         | Subtle ring around archers showing 128 px friendly radius    |
| **Terrain tooltip**         | On hover: terrain name, speed modifier, defense bonus        |
| **Waypoint path**           | Dotted line from unit to movement destination (click target) |
| **Stamina warning**         | Flashing stamina bar when below 25%                          |

### Stamina Bar Design

```
┌──────────────────────────┐
│ ██████████░░░░░░  HP     │  ← Red/green, existing
│ ████████░░░░░░░░  STA    │  ← Yellow/orange, new
└──────────────────────────┘
```

- **Position:** Directly below the HP bar, same width
- **Color:** Yellow (> 50%) → Orange (25%–50%) → Red pulsing (< 25%)
- **Size:** 4 px tall (HP bar is 6 px tall)
- **Visibility:** Always visible on all units (both player and enemy)

### Movement Commands

| Input             | Action                                                  |
|-------------------|---------------------------------------------------------|
| Right-click       | Move to point (pathfinding around water/enemies)        |
| Right-click enemy | Move to and attack enemy                                |
| Shift+right-click | Queue waypoint (unit moves to each in sequence)         |
| H key             | Halt — stop immediately (begins stamina recovery)       |
| Hold position     | Unit defends but does not pursue (enables brace timer)  |

---

## 10. Combat Modifiers Summary

Complete reference of all combat modifiers in the new system.

### Damage Formula

```
rawDamage     = effectiveAttack - (effectiveDefense × (1 + terrainDefenseBonus))
staminaMod    = staminaModifier(attacker)  // see §2
defenseMod    = staminaModifier(defender)  // see §2
chargeMod     = chargeMultiplier           // see §3, default 1.0
flankMod      = flankMultiplier            // see below
braceMod      = braceMultiplier            // see §4, default 1.0
archerDefMod  = archerProximityModifier    // see §5, default 1.0

effectiveAttack  = baseAttack  × staminaMod × chargeMod × flankMod
effectiveDefense = baseDefense × defenseMod × braceMod × archerDefMod × (1 + terrainDefenseBonus)

finalDamage = max(1, effectiveAttack - effectiveDefense) × randomVariance(0.85, 1.15)
```

### All Modifiers Table

| Modifier                     | Condition                                         | Effect                           |
|------------------------------|---------------------------------------------------|----------------------------------|
| **Stamina attack penalty**   | Stamina < 50%                                     | Attack × (0.5 + staminaRatio)    |
| **Stamina defense penalty**  | Stamina < 50%                                     | Defense × (0.5 + staminaRatio)   |
| **Stamina speed penalty**    | Stamina < 30%                                     | Speed × (0.5 + staminaRatio/0.3×0.5) |
| **Cavalry charge**           | Moving ≥ 112 px/s, 128+ px toward target, stamina ≥ 20 | Attack × 1.5                |
| **Charge (side flank)**      | Charge + side angle (60°–120°)                    | Attack × 1.95                    |
| **Charge (rear flank)**      | Charge + rear angle (> 120°)                      | Attack × 2.25                    |
| **Flank (side)**             | Attack angle 60°–120° (no charge)                 | Attack × 1.3                     |
| **Flank (rear)**             | Attack angle > 120° (no charge)                   | Attack × 1.5                     |
| **Infantry brace**           | Stationary ≥ 2 s, stamina ≥ 15                    | Defense × 1.35                   |
| **Brace vs cavalry**         | Braced infantry vs cavalry                        | Defense × 1.69, negates charge   |
| **Archer grouped**           | 2 friendly non-archers within 128 px              | Defense × 1.25                   |
| **Archer well-protected**    | 3+ friendly non-archers within 128 px             | Defense × 1.40                   |
| **Archer isolated**          | 0 friendlies within 128 px                        | Defense × 0.60, −3 morale/s      |
| **Height advantage**         | Attacker on hills, defender not                   | Attack × 1.15                    |
| **Archer in melee**          | Archer target within 40 px                        | Attack × 0.60                    |
| **Forest ranged penalty**    | Ranged attack into/out of forest                  | Damage × 0.70                    |
| **Road stamina recovery**    | Stationary on road                                | Recovery 6/s (vs 4/s normal)     |
| **Low morale**               | Attacker morale < 50                              | Attack × 0.80                    |
| **Terrain defense (hills)**  | Defender on hills                                 | Defense + 20%                    |
| **Terrain defense (forest)** | Defender in forest                                | Defense + 30%                    |
| **Random variance**          | Every attack                                      | × 0.85 to × 1.15                |

### Morale Effects (Unchanged except where noted)

| Event                          | Morale Change            |
|--------------------------------|--------------------------|
| Taking damage                  | −(damage × 0.30)         |
| Nearby friendly death (192 px) | −10                      |
| Outnumbered 2:1 in 192 px     | −5/s                     |
| Near friendlies (128 px)       | +2/s recovery            |
| Cavalry charge impact          | −8 on target (new)       |
| Archer isolated (192 px)       | −3/s (new)               |
| Routes at                      | Morale < 25              |

---

## Appendix A: Balance Scenarios

### Scenario 1 — Cavalry charges braced infantry on plains

- Cavalry: 20 atk × 1.5 charge × 1.0 stam = 30 effective attack
- Infantry braced: 12 def × 1.69 brace-vs-cav × 1.0 stam = 20.3 effective defense
- Charge reduced by brace: 1.5 → 1.0, so effective attack = 20 × 1.0 = 20
- Braced defense still 20.3 → raw damage = max(1, 20 − 20.3) = **1 damage**
- **Result:** Head-on charge into braced infantry is nearly useless ✓

### Scenario 2 — Cavalry rear-charges unbraced infantry on plains

- Cavalry: 20 atk × 2.25 (rear charge) = 45 effective attack
- Infantry: 12 def, no brace = 12 effective defense
- Raw damage = 45 − 12 = **33 damage** (33% of infantry HP)
- **Result:** Devastating flank attack ✓

### Scenario 3 — Isolated archer vs infantry

- Infantry: 15 atk
- Archer isolated: 5 def × 0.6 = 3.0 effective defense
- Raw damage = 15 − 3 = **12 damage** (20% of archer HP per hit)
- **Result:** Archer dies in ~5 hits — very fragile alone ✓

### Scenario 4 — Protected archer at range vs infantry

- Archer: 18 atk at 256 px range
- Infantry: 12 def on plains, approaching
- Archer gets ~8 shots before infantry closes (256 px ÷ 80 px/s ÷ 2 s/shot = 1.6, so ~8 shots accounting for approach time)
- Damage per shot: max(1, 18 − 12) = 6 × ~8 shots = **~48 damage**
- **Result:** Archers hurt but don't solo-kill infantry — need support ✓

### Scenario 5 — Exhausted cavalry (0 stamina) vs fresh infantry

- Cavalry: 20 atk × 0.5 stam = 10 effective attack
- Infantry: 12 def × 1.0 = 12 effective defense
- Raw damage = max(1, 10 − 12) = **1 damage**
- **Result:** Exhausted cavalry is combat-ineffective ✓

---

## Appendix B: Implementation Priority

| Priority | System                  | Depends On       | Estimate |
|----------|-------------------------|------------------|----------|
| P0       | Free movement (remove grid) | —             | 2 days   |
| P0       | Pathfinding (continuous A*) | Free movement  | 1 day    |
| P1       | Stamina system          | Free movement    | 1 day    |
| P1       | Terrain speed/drain     | Stamina, movement| 0.5 days |
| P1       | Stamina UI (bar, warnings)| Stamina system | 0.5 days |
| P2       | Cavalry charge          | Stamina, movement| 1 day    |
| P2       | Infantry brace          | Stamina          | 0.5 days |
| P2       | Archer proximity        | —                | 0.5 days |
| P2       | Unit collision          | Free movement    | 1 day    |
| P3       | UI polish (trails, rings)| All above       | 1 day    |
| P3       | Balance tuning          | All above        | Ongoing  |

**Total estimate:** ~9 days of development + ongoing balance tuning.
