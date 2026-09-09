// Ancient Warrior automation for Black Crusade Automation / Apex Heresy
// Tested behavior:
// - Detects Ancient Warrior on the selected actor.
// - On Fellowship-based common rolls, adds a manual checkbox:
//   "Цель — ветеран Long War (+10)"
// - When enabled, adds +10 to the roll modifier.
// - Does not affect attack dialogs.
// - Loyalty and Legion Availability effects are not automated here.

(() => {
  const TALENT = {
    id: "M1SnKkD6mxtIgrgU",
    name: "Ancient Warrior",
    source: "Compendium.dark-heresy.black-crusade.Item.M1SnKkD6mxtIgrgU"
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

  function textLooksLikeFellowship(text) {
    const value = normalize(text);

    return (
      value.includes("fellowship") ||
      value.includes("общительность") ||
      value.includes("общит") ||
      value === "fel"
    );
  }

  function optionIsFellowship(option) {
    if (!option) return false;

    return (
      textLooksLikeFellowship(option.value) ||
      textLooksLikeFellowship(option.textContent)
    );
  }

  function isFellowshipRoll(dialog) {
    const characteristic = dialog.querySelector("#characteristic");

    if (characteristic) {
      return optionIsFellowship(
        characteristic.selectedOptions?.[0]
      );
    }

    const title =
      dialog.querySelector(".window-title")?.textContent ??
      dialog.getAttribute("aria-label") ??
      "";

    return textLooksLikeFellowship(title);
  }

  function hasFellowshipOption(dialog) {
    const characteristic = dialog.querySelector("#characteristic");

    if (!characteristic) {
      return isFellowshipRoll(dialog);
    }

    return [...characteristic.options].some(option =>
      optionIsFellowship(option)
    );
  }

  function inject(dialog) {
    if (!(dialog instanceof HTMLElement)) return;

    const modifier = dialog.querySelector("#modifier");
    const difficulty = dialog.querySelector("#difficulty");

    // Common Apex roll dialog only.
    if (!modifier || !difficulty) return;

    // Do not touch attack dialogs.
    if (dialog.querySelector("#damageFormula")) return;

    // Already injected.
    if (dialog.querySelector("#bcAncientWarriorRow")) return;

    const actor = getActor();

    if (!actor) return;
    if (!hasTalent(actor)) return;

    // Do not display Ancient Warrior where Fellowship cannot be used.
    if (!hasFellowshipOption(dialog)) return;

    const modifierRow = modifier.parentElement;
    if (!modifierRow) return;

    const row = document.createElement("div");
    row.className = modifierRow.className;
    row.id = "bcAncientWarriorRow";

    row.innerHTML = `
      <label style="align-self:start;">
        ANCIENT WARRIOR
      </label>

      <div>
        <label style="
          display:flex;
          gap:7px;
          align-items:center;
          cursor:pointer;
        ">
          <input
            id="bcAncientWarriorLongWar"
            type="checkbox"
          >
          Цель — ветеран Long War (+10)
        </label>

        <div
          id="bcAncientWarriorInfo"
          style="
            font-size:10px;
            margin-top:4px;
            opacity:.8;
            line-height:1.25;
          "
        ></div>
      </div>
    `;

    modifierRow.after(row);

    const checkbox =
      row.querySelector("#bcAncientWarriorLongWar");

    const info =
      row.querySelector("#bcAncientWarriorInfo");

    const characteristic =
      dialog.querySelector("#characteristic");

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
      const fellowship = isFellowshipRoll(dialog);

      checkbox.disabled = !fellowship;

      if (!fellowship && checkbox.checked) {
        checkbox.checked = false;
      }

      automationModifier =
        fellowship && checkbox.checked
          ? 10
          : 0;

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

      if (!fellowship) {
        info.textContent =
          "Бросок сейчас не основан на Общительности.";
      } else if (checkbox.checked) {
        info.textContent =
          `Ancient Warrior: +10. Итог: ${total >= 0 ? "+" : ""}${total}`;
      } else {
        info.textContent =
          `Ветеран Long War не выбран. Итог: ${total >= 0 ? "+" : ""}${total}`;
      }
    }

    checkbox.addEventListener("change", apply);

    characteristic?.addEventListener(
      "change",
      apply
    );

    apply();

    console.log(
      "Black Crusade Automation | Ancient Warrior injected",
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
      "Black Crusade Automation | Ancient Warrior active"
    );
  }

  Hooks.once("ready", () => {
    start();
  });

  globalThis.BCAAncientWarrior = {
    start,
    scan,
    hasTalent
  };
})();
