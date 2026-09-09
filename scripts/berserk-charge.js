// Berserk Charge automation for Black Crusade Automation / Apex Heresy
// Tested in Apex:
// - Apex Charge / Натиск gives +20.
// - Berserk Charge adds another +10.
// - Effective Charge bonus becomes +30.

(() => {
  const TALENT = {
    id: "ZA0SjskeJRWBK8Cv",
    name: "Berserk Charge",
    source: "Compendium.dark-heresy.black-crusade.Item.ZA0SjskeJRWBK8Cv"
  };

  const STATE = {
    observer: null
  };

  function normalize(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/\s+/g, " ");
  }

  function getActor() {
    const bca = globalThis.BlackCrusadeAutomation;

    if (bca?.getActor) {
      const actor = bca.getActor();
      if (actor) return actor;
    }

    return canvas?.tokens?.controlled?.[0]?.actor
      ?? game.user?.character
      ?? null;
  }

  function hasTalent(actor) {
    if (!actor?.items) return false;

    const bca = globalThis.BlackCrusadeAutomation;

    if (bca?.hasTalent) {
      return bca.hasTalent(
        actor,
        [TALENT.name],
        TALENT.source
      );
    }

    return actor.items.some(item => {
      if (item.type !== "talent") return false;

      if (item.id === TALENT.id) return true;
      if (normalize(item.name) === normalize(TALENT.name)) return true;

      const source = item._stats?.compendiumSource ?? "";

      return (
        source === TALENT.source ||
        source.endsWith(`.Item.${TALENT.id}`)
      );
    });
  }

  function optionIsCharge(option) {
    if (!option) return false;

    const text = normalize(
      `${option.value ?? ""} ${option.textContent ?? ""}`
    );

    return (
      text.includes("charge") ||
      text.includes("натиск")
    );
  }

  function isCharge(attackType) {
    return optionIsCharge(
      attackType?.selectedOptions?.[0]
    );
  }

  function hasChargeOption(attackType) {
    return [...attackType.options].some(option =>
      optionIsCharge(option)
    );
  }

  function inject(dialog) {
    if (!(dialog instanceof HTMLElement)) return;

    const modifier = dialog.querySelector("#modifier");
    const attackType = dialog.querySelector("#attackType");
    const damage = dialog.querySelector("#damageFormula");

    if (!modifier || !attackType || !damage) return;

    if (!hasChargeOption(attackType)) return;
    if (dialog.querySelector("#bcBerserkChargeRow")) return;

    const actor = getActor();

    if (!actor) return;
    if (!hasTalent(actor)) return;

    const attackRow = attackType.parentElement;
    if (!attackRow) return;

    const row = document.createElement("div");
    row.className = attackRow.className;
    row.id = "bcBerserkChargeRow";

    row.innerHTML = `
      <label>BERSERK CHARGE</label>

      <div
        id="bcBerserkChargeInfo"
        style="
          font-size:10px;
          opacity:.8;
          line-height:1.3;
        "
      ></div>
    `;

    attackRow.after(row);

    const info =
      row.querySelector("#bcBerserkChargeInfo");

    let manualModifier =
      Number.parseInt(modifier.value, 10);

    if (Number.isNaN(manualModifier)) {
      manualModifier = 0;
    }

    let automationModifier = 0;
    let internalChange = false;

    function rememberManualModifier() {
      if (internalChange) return;

      let current =
        Number.parseInt(modifier.value, 10);

      if (Number.isNaN(current)) current = 0;

      manualModifier =
        current - automationModifier;
    }

    modifier.addEventListener(
      "input",
      rememberManualModifier
    );

    modifier.addEventListener(
      "change",
      rememberManualModifier
    );

    function apply() {
      const charging = isCharge(attackType);

      automationModifier = charging ? 10 : 0;

      const total =
        manualModifier + automationModifier;

      internalChange = true;

      modifier.value = total;

      modifier.dispatchEvent(
        new Event("input", { bubbles: true })
      );

      modifier.dispatchEvent(
        new Event("change", { bubbles: true })
      );

      internalChange = false;

      if (charging) {
        info.textContent =
          "Натиск: Apex +20, Berserk Charge +10 → всего +30. Доп. модификатор таланта: +10.";
      } else {
        info.textContent =
          "Berserk Charge срабатывает только при Натиске.";
      }
    }

    attackType.addEventListener("change", apply);

    apply();

    console.log(
      "Black Crusade Automation | Berserk Charge injected",
      {
        actor: actor.name
      }
    );
  }

  function scan() {
    document
      .querySelectorAll("dialog.dark-heresy-dialog")
      .forEach(inject);
  }

  function start() {
    if (STATE.observer) {
      STATE.observer.disconnect();
    }

    scan();

    STATE.observer = new MutationObserver(scan);

    STATE.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log(
      "Black Crusade Automation | Berserk Charge active"
    );
  }

  Hooks.once("ready", () => {
    start();
  });

  globalThis.BCABerserkCharge = {
    start,
    scan,
    hasTalent
  };
})();
