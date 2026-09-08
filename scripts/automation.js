const BCA = {
  observer: null,

  hasTalent(actor, names, compendiumSource) {
    if (!actor) return false;

    const normalizedNames = names.map(n => n.toLowerCase());

    return actor.items.some(item => {
      if (item.type !== "talent") return false;

      const itemName = (item.name ?? "").toLowerCase();
      const source = item._stats?.compendiumSource ?? "";

      return normalizedNames.includes(itemName) || source === compendiumSource;
    });
  },

  getActor() {
    const tokenActor = canvas?.tokens?.controlled?.[0]?.actor;
    if (tokenActor) return tokenActor;

    if (game.user?.character) return game.user.character;

    return null;
  },

  scanAttackDialogs() {
    const dialogs = document.querySelectorAll("dialog.dark-heresy-dialog");

    for (const dialog of dialogs) {
      const target = dialog.querySelector("#target");
      const modifier = dialog.querySelector("#modifier");
      const attackType = dialog.querySelector("#attackType");
      const damage = dialog.querySelector("#damageFormula");
      const penetration = dialog.querySelector("#penetration");

      if (!target || !modifier || !attackType || !damage || !penetration) continue;
      if (dialog.querySelector("#bcWeaponMode")) continue;

      const actor = this.getActor();

      if (!actor) {
        console.warn("Black Crusade Automation | Не удалось определить персонажа для окна атаки.");
        continue;
      }

      const hasAmbidextrous = this.hasTalent(
        actor,
        ["Ambidextrous"],
        "Compendium.dark-heresy.black-crusade.Item.bR8wdIAhcEQkend8"
      );

      const hasTwoWeapon = this.hasTalent(
        actor,
        ["Two-weapon Wielder", "Two-Weapon Wielder", "Two Weapon Wielder"],
        "Compendium.dark-heresy.black-crusade.Item.HG8y09yML3dTOXRA"
      );

      const damageRow = damage.parentElement;
      if (!damageRow) continue;

      const newRow = document.createElement("div");
      newRow.className = damageRow.className;
      newRow.id = "bcWeaponModeRow";

      newRow.innerHTML = `
        <label>ИСПОЛЬЗОВАНИЕ ОРУЖИЯ</label>
        <select id="bcWeaponMode">
          <option value="normal">Обычная атака</option>
          <option value="offhand">Неосновная рука</option>
          <option value="twoWeapon">Два оружия</option>
        </select>
        <div id="bcWeaponInfo"
             style="font-size:10px;margin-top:3px;opacity:.8;line-height:1.25;"></div>
      `;

      const weaponMode = newRow.querySelector("#bcWeaponMode");
      weaponMode.className = attackType.className;

      damageRow.before(newRow);

      const info = newRow.querySelector("#bcWeaponInfo");

      let manualModifier = parseInt(modifier.value, 10);
      if (Number.isNaN(manualModifier)) manualModifier = 0;

      let automationModifier = 0;
      let internalChange = false;

      const rememberManualModifier = () => {
        if (internalChange) return;

        let current = parseInt(modifier.value, 10);
        if (Number.isNaN(current)) current = 0;

        manualModifier = current - automationModifier;
      };

      modifier.addEventListener("change", rememberManualModifier);
      modifier.addEventListener("input", rememberManualModifier);

      const applyWeaponMode = () => {
        automationModifier = 0;
        let message = "";

        switch (weaponMode.value) {
          case "normal":
            automationModifier = 0;
            message = "Обычная атака: дополнительного штрафа нет.";
            break;

          case "offhand":
            if (hasAmbidextrous) {
              automationModifier = 0;
              message = "Ambidextrous: штраф −20 за неосновную руку отменён.";
            } else {
              automationModifier = -20;
              message = "Нет Ambidextrous: штраф −20.";
            }
            break;

          case "twoWeapon":
            if (!hasTwoWeapon) {
              automationModifier = 0;
              message = "⚠ Нет Two-Weapon Wielder.";
            } else if (hasAmbidextrous) {
              automationModifier = -10;
              message = "Two-Weapon Wielder + Ambidextrous: штраф −10.";
            } else {
              automationModifier = -20;
              message = "Two-Weapon Wielder: штраф −20.";
            }
            break;
        }

        const total = manualModifier + automationModifier;

        internalChange = true;
        modifier.value = total;
        modifier.dispatchEvent(new Event("input", { bubbles: true }));
        internalChange = false;

        info.textContent =
          `${message} Итог: ${total >= 0 ? "+" : ""}${total}`;
      };

      weaponMode.addEventListener("change", applyWeaponMode);
      applyWeaponMode();
    }
  },

  start() {
    if (this.observer) this.observer.disconnect();

    this.scanAttackDialogs();

    this.observer = new MutationObserver(() => this.scanAttackDialogs());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log("Black Crusade Automation | v0.7.1 active");
  }
};

Hooks.once("ready", () => {
  BCA.start();

  if (game.user?.isGM) {
    ui.notifications.info("Black Crusade Automation v0.7.1 включён для мира.");
  }
});

globalThis.BlackCrusadeAutomation = BCA;