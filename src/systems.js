/**
 * systems.js - Drug system, transaction system, economy, and time
 */

// ─────────────────────────────────────────────────────────────────────────────
// Drug Catalogue
// ─────────────────────────────────────────────────────────────────────────────
export const DRUGS = {
  weed:    { id: 'weed',    name: 'Grass',    basePrice: 10,  craftCost: 5,   ingredients: { herb: 2 } },
  pills:   { id: 'pills',   name: 'Pills',    basePrice: 25,  craftCost: 12,  ingredients: { chemical: 1, herb: 1 } },
  powder:  { id: 'powder',  name: 'Powder',   basePrice: 50,  craftCost: 20,  ingredients: { chemical: 3 } },
  crystal: { id: 'crystal', name: 'Crystal',  basePrice: 150, craftCost: 60,  ingredients: { chemical: 5, catalyst: 1 } },
  // Mixes
  speedball: { id: 'speedball', name: 'Speedball', basePrice: 60,  craftCost: 0, ingredients: { weed: 1, pills: 1 } },
  rocket:    { id: 'rocket',    name: 'Rocket',    basePrice: 120, craftCost: 0, ingredients: { powder: 1, pills: 1 } },
  moonrock:  { id: 'moonrock',  name: 'Moonrock',  basePrice: 250, craftCost: 0, ingredients: { crystal: 1, weed: 1 } },
  godmode:   { id: 'godmode',   name: 'Godmode',   basePrice: 500, craftCost: 0, ingredients: { moonrock: 1, crystal: 1 } },
};

// Raw ingredients
export const INGREDIENTS = {
  herb:     { name: 'Zioło',     price: 3  },
  chemical: { name: 'Chemikalia', price: 5  },
  catalyst: { name: 'Katalizator', price: 15 },
};

// Which drugs can be crafted at home (base tier)
export const CRAFTABLE_BASE = ['weed', 'pills', 'powder', 'crystal'];

// Mix recipes (drugA + drugB = result)
export const MIX_RECIPES = [
  { inputs: ['weed', 'pills'],   output: 'speedball' },
  { inputs: ['powder', 'pills'], output: 'rocket'    },
  { inputs: ['crystal', 'weed'], output: 'moonrock'  },
  { inputs: ['moonrock', 'crystal'], output: 'godmode' },
];

// ─────────────────────────────────────────────────────────────────────────────
// DrugSystem
// ─────────────────────────────────────────────────────────────────────────────
export class DrugSystem {
  constructor() {
    // Live price modifiers per drug (fluctuate by ±20%)
    this._priceModifiers = {};
    for (const id in DRUGS) this._priceModifiers[id] = 1.0;
    this._fluctTimer = 0;
  }

  update(dt) {
    this._fluctTimer += dt;
    // Fluctuate prices every 60 real seconds
    if (this._fluctTimer >= 60) {
      this._fluctTimer = 0;
      this._fluctuatePrices();
    }
  }

  _fluctuatePrices() {
    for (const id in DRUGS) {
      // Random walk within ±20%
      const delta = (Math.random() - 0.5) * 0.1;
      this._priceModifiers[id] = Math.max(0.8, Math.min(1.2, this._priceModifiers[id] + delta));
    }
  }

  /** Get current sale price for a drug (what player earns) */
  getSalePrice(drugId, isNight = false) {
    const drug = DRUGS[drugId];
    if (!drug) return 0;
    let price = drug.basePrice * this._priceModifiers[drugId];
    if (isNight) price *= 1.3;
    return Math.floor(price);
  }

  /** Buy price = craftCost (for base) or ingredient cost */
  getBuyPrice(drugId) {
    return DRUGS[drugId]?.craftCost || 0;
  }

  /** Get all visible price modifier info */
  getPriceInfo(isNight) {
    return Object.keys(DRUGS).map(id => ({
      id,
      name: DRUGS[id].name,
      price: this.getSalePrice(id, isNight),
      mod: this._priceModifiers[id],
    }));
  }

  /** Can player craft a drug? Returns missing ingredients or null if ok */
  canCraft(drugId, playerInventory, ingredientInventory) {
    const drug = DRUGS[drugId];
    if (!drug) return { error: 'Unknown drug' };
    const missing = {};
    for (const [ing, qty] of Object.entries(drug.ingredients)) {
      // Ingredients can come from both inventories
      const have = (ingredientInventory[ing] || 0) + (playerInventory[ing] || 0);
      if (have < qty) missing[ing] = qty - have;
    }
    return Object.keys(missing).length ? missing : null;
  }

  /** Mix two drugs from inventory → result, or null if no recipe */
  findMix(drugA, drugB) {
    for (const recipe of MIX_RECIPES) {
      if (
        (recipe.inputs[0] === drugA && recipe.inputs[1] === drugB) ||
        (recipe.inputs[0] === drugB && recipe.inputs[1] === drugA)
      ) return recipe;
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TransactionSystem
// ─────────────────────────────────────────────────────────────────────────────
export const TRANSACTION_RESULT = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAIL:    'FAIL',
  BUSTED:  'BUSTED',
  NO_DRUGS:'NO_DRUGS',
  NO_NPC:  'NO_NPC',
});

export class TransactionSystem {
  constructor(drugSystem, timeSystem) {
    this.drugSystem  = drugSystem;
    this.timeSystem  = timeSystem;
    this.baseRisk    = 0.08;  // 8% base bust risk
    this._cooldown   = 0;
  }

  update(dt) {
    this._cooldown = Math.max(0, this._cooldown - dt);
  }

  /** Try to deal to the nearest willing NPC within range */
  attemptDeal(player, npcs, drugId, qty = 1) {
    if (this._cooldown > 0) return { result: TRANSACTION_RESULT.FAIL, reason: 'Cooldown' };
    if (!player.hasDrug(drugId, qty)) return { result: TRANSACTION_RESULT.NO_DRUGS };

    // Find closest NPC within 40 world px
    let closest = null, closestDist = 40;
    for (const npc of npcs) {
      if (npc.isDead || npc.hasDealt) continue;
      const dx = npc.x - player.x, dy = npc.y - player.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) { closest = npc; closestDist = d; }
    }
    if (!closest) return { result: TRANSACTION_RESULT.NO_NPC };

    // Roll buyProb (modified by player charisma)
    const charismaBonus = player.stats.charisma * 0.05;
    const buyProb = Math.min(0.98, closest.buyProb + charismaBonus);
    if (Math.random() > buyProb) {
      this._cooldown = 1.5;
      player.burnout = Math.min(100, player.burnout + 3);
      return { result: TRANSACTION_RESULT.FAIL, reason: 'NPC refused' };
    }

    // Roll bust risk
    const intBonus  = player.stats.intelligence * 0.05;
    const burnoutMult = 1 + player.burnout / 100;
    const risk = this.baseRisk * closest.riskMult * burnoutMult * (1 - intBonus);
    if (Math.random() < risk) {
      return { result: TRANSACTION_RESULT.BUSTED, npc: closest };
    }

    // Success!
    const isNight = this.timeSystem.isNight();
    const price = this.drugSystem.getSalePrice(drugId, isNight) * qty;
    player.removeDrug(drugId, qty);
    player.money += price;
    player.respect = Math.min(999, player.respect + 1);
    player.burnout = Math.min(100, player.burnout + 5);
    player.fatigue = Math.min(100, player.fatigue + 2);
    closest.hasDealt = true;
    closest.isAngry  = false;

    this._cooldown = 0.8;
    return { result: TRANSACTION_RESULT.SUCCESS, price, npc: closest };
  }

  /** Increase global risk (called every 7 in-game days) */
  increaseRisk() {
    this.baseRisk = Math.min(0.5, this.baseRisk + 0.05);
  }

  getBaseRisk() { return this.baseRisk; }
}

// ─────────────────────────────────────────────────────────────────────────────
// TimeSystem
// ─────────────────────────────────────────────────────────────────────────────
export class TimeSystem {
  constructor() {
    // 1 real second = 10 game minutes
    this.gameMinutesPerRealSecond = 10;
    this.totalGameMinutes = 6 * 60; // start at 06:00

    this.day   = 1;
    this.week  = 1;
    this.month = 1;
    this.year  = 1;
    this._totalDaysElapsed = 0; // always-incrementing day counter
  }

  update(dt) {
    this.totalGameMinutes += dt * this.gameMinutesPerRealSecond;

    // Wrap day
    if (this.totalGameMinutes >= 24 * 60) {
      this.totalGameMinutes -= 24 * 60;
      this.day++;
      this._totalDaysElapsed++;

      if (this.day > 7) { this.day = 1; this.week++; }
      if (this.week > 4) { this.week = 1; this.month++; }
      if (this.month > 12) { this.month = 1; this.year++; }
    }
  }

  getHour()   { return Math.floor(this.totalGameMinutes / 60); }
  getMinute() { return Math.floor(this.totalGameMinutes % 60); }

  isNight() {
    const h = this.getHour();
    return h >= 20 || h < 6;
  }

  getTimeString() {
    const h = String(this.getHour()).padStart(2, '0');
    const m = String(this.getMinute()).padStart(2, '0');
    return `${h}:${m}`;
  }

  getDateString() {
    return `Dzień ${this.day} / Tyg ${this.week} / Mies ${this.month}`;
  }

  /** Total in-game days elapsed (accurate running counter) */
  totalDays() {
    return this._totalDaysElapsed;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EconomySystem
// ─────────────────────────────────────────────────────────────────────────────
export const BUSINESSES = {
  bar:        { name: 'Bar',          incomePerHour: 20,  cost: 500  },
  pub:        { name: 'Pub',          incomePerHour: 35,  cost: 900  },
  brothel:    { name: 'Burdel',       incomePerHour: 80,  cost: 2500 },
  laundromat: { name: 'Pralnia',      incomePerHour: 15,  cost: 400, launders: true },
};

export class EconomySystem {
  constructor(timeSystem) {
    this.timeSystem = timeSystem;
    this.ownedBusinesses = [];  // array of business ids
    this._lastHour = timeSystem.getHour();
    this.cryptoWallet = 0;  // clean money that survives jail
    this._incomeAccum = 0;  // fractional hours accumulated
  }

  update(dt) {
    const currentHour = this.timeSystem.getHour();
    // Check if an hour passed
    if (this._lastHour !== currentHour) {
      this._lastHour = currentHour;
      return this._collectPassiveIncome();
    }
    return 0;
  }

  _collectPassiveIncome() {
    let total = 0;
    for (const bizId of this.ownedBusinesses) {
      const biz = BUSINESSES[bizId];
      if (biz) total += biz.incomePerHour;
    }
    return total;
  }

  buyBusiness(bizId, player) {
    const biz = BUSINESSES[bizId];
    if (!biz) return false;
    if (player.money < biz.cost) return false;
    if (this.ownedBusinesses.includes(bizId)) return false;
    player.money -= biz.cost;
    this.ownedBusinesses.push(bizId);
    return true;
  }

  /** Launder money to crypto (requires laundromat) */
  launder(amount, player) {
    if (!this.ownedBusinesses.includes('laundromat')) return false;
    const fee = Math.floor(amount * 0.20);  // 20% laundering fee
    const net = amount - fee;
    if (player.money < amount) return false;
    player.money -= amount;
    this.cryptoWallet += net;
    return { laundered: net, fee };
  }

  /** On bust — lose all drugs, lose money (crypto safe) */
  processBust(player) {
    const lostDrugs = { ...player.inventory };
    const lostMoney = player.money;
    player.inventory = {};
    player.money = 0;
    player.burnout = 80;   // high burnout after jail
    player.fatigue = 60;
    return { lostDrugs, lostMoney };
  }

  getPassiveIncomePerHour() {
    return this.ownedBusinesses.reduce((sum, id) => {
      return sum + (BUSINESSES[id]?.incomePerHour || 0);
    }, 0);
  }
}
