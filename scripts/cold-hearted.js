// Cold Hearted automation for Black Crusade Automation / Apex Heresy
// Tested in Apex:
// 1) +20 to Willpower in opposed tests against Charm.
// 2) Seduction attempts against a target with Cold Hearted automatically fail.
// 3) When Cold Hearted is newly added to an Actor, that Actor gains +1 Corruption once.

(() => {
  const MODULE_ID = "black-crusade-automation";

  const TALENT = {
    id: "QpQZeSZydpnFU8vs",
    name: "Cold Hearted",
    source: "Compendium.dark-heresy.black-crusade.Item.QpQZeSZydpnFU8vs"
  };

  const CORRUPTION_FLAG = "coldHeartedCorruptionApplied";

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

  function isColdHeartedItem(item) {
    if (!item) return false;
    if (item.type !== "talent") return false;

    const source = item._stats?.compendiumSource ?? "";

    return (
      item.id === TALENT.id ||
      normalize(item.name) === normalize(TALENT.name) ||
      source === TALENT.source ||
      source.endsWith(`.Item.${TALENT.id}`)
    );
  }

  function hasTalent(actor) {
    if (!actor?.items) return false;

    const bca = globalThis.BlackCrusadeAutomation;

    if (bca?.hasTalent) {
      try {
        return bca.hasTalent(
          actor,
          [TALENT.name],
          TALENT.source
        );
      } catch (_) {
        // Fall through to local detection.
      }
    }

    return actor.items.some(isColdHeartedItem);
  }

  function looksLikeWillpower(text) {
    const value = normalize(text);

    return (
      value.includes("willpower") ||
      value.includes("сила воли") ||
      value === "wp"
    );
  }

  function optionIsWillpower(option) {
    if (!option) return false;

    return (
      looksLikeWillpower(option.value) ||
      looksLikeWillpower(option.textContent)
    );
  }

  function isWillpowerRoll(dialog) {
    const characteristic =
      dialog.querySelector("#characteristic");

    if (characteristic) {
      return optionIsWillpower(
        characteristic.selectedOptions?.[0]
      );
    }

    const title = normalize(
      dialog.querySelector(".window-title")?.textContent
      ?? dialog.getAttribute("aria-label")
      ?? ""
    );

    return looksLikeWillpower(title);
  }

  function hasWillpowerOption(dialog) {
    const characteristic =
      dialog.querySelector("#characteristic");

    if (!characteristic) {
      return isWillpowerRoll(dialog);
    }

    return [...characteristic.options]
      .some(option => optionIsWillpower(option));
  }

  function isCharmDialog(dialog) {
    const title = normalize(
      dialog.querySelector(".window-title")?.textContent
      ?? dialog.getAttribute("aria-label")
      ?? ""
    );

    return (
      title.includes("обаяние") ||
      title.includes("charm")
    );
  }

  function getSingleTargetToken() {
    const targets = [...(game.user?.targets ?? [])];
    return targets.length === 1 ? targets[0] : null;
  }

  function injectWillpowerBonus(dialog) {
    if (!(dialog instanceof HTMLElement)) return;

    const modifier = dialog.querySelector("#modifier");
    const difficulty = dialog.querySelector("#difficulty");

    if (!modifier || !difficulty) return;

    // Never inject into combat dialogs.
    if (dialog.querySelector("#damageFormula")) return;

    if (dialog.querySelector("#bcColdHeartedRow")) return;

    const actor = getActor();

    if (!actor || !hasTalent(actor)) return;
    if (!hasWillpowerOption(dialog)) return;

    const modifierRow = modifier.parentElement;
    if (!modifierRow) return;

    const row = document.createElement("div");
    row.className = modifierRow.className;
    row.id = "bcColdHeartedRow";

    row.innerHTML = `
      <label style="align-self:start;">
        COLD HEARTED
      </label>

      <div>
        <label style="
          display:flex;
          gap:7px;
          align-items:center;
          cursor:pointer;
        ">
          <input
            id="bcColdHeartedCharm"
            type="checkbox"
          >

          Встречная проверка против Обаяния (+20)
        </label>

        <div
          id="bcColdHeartedInfo"
          style="
            font-size:10px;
            margin-top:5px;
            opacity:.8;
            line-height:1.35;
          "
        ></div>
      </div>
    `;

    modifierRow.after(row);

    const checkbox =
      row.querySelector("#bcColdHeartedCharm");

    const info =
      row.querySelector("#bcColdHeartedInfo");

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
      const willpower =
        isWillpowerRoll(dialog);

      checkbox.disabled = !willpower;

      if (!willpower && checkbox.checked) {
        checkbox.checked = false;
      }

      automationModifier =
        willpower && checkbox.checked ? 20 : 0;

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

      if (!willpower) {
        info.textContent =
          "Cold Hearted применяется к встречной проверке Силы воли.";
      } else if (checkbox.checked) {
        info.textContent =
          `Cold Hearted: +20 против Обаяния. Итог: ${
            total >= 0 ? "+" : ""
          }${total}`;
      } else {
        info.textContent =
          `Обаяние не выбрано. Итог: ${
            total >= 0 ? "+" : ""
          }${total}`;
      }
    }

    checkbox.addEventListener("change", apply);
    characteristic?.addEventListener("change", apply);

    apply();

    console.log(
      "Black Crusade Automation | Cold Hearted WP bonus injected",
      { actor: actor.name }
    );
  }

  function injectSeductionAutoFail(dialog) {
    if (!(dialog instanceof HTMLElement)) return;
    if (!isCharmDialog(dialog)) return;

    if (
      dialog.querySelector(
        "#bcColdHeartedSeductionRow"
      )
    ) {
      return;
    }

    const modifier =
      dialog.querySelector("#modifier");

    const difficulty =
      dialog.querySelector("#difficulty");

    if (!modifier || !difficulty) return;

    const targetToken =
      getSingleTargetToken();

    if (!targetToken?.actor) return;

    const targetActor =
      targetToken.actor;

    if (!hasTalent(targetActor)) return;

    const attacker = getActor();

    const modifierRow =
      modifier.parentElement;

    if (!modifierRow) return;

    const row =
      document.createElement("div");

    row.className = modifierRow.className;
    row.id =
      "bcColdHeartedSeductionRow";

    row.innerHTML = `
      <label style="align-self:start;">
        COLD HEARTED
      </label>

      <div>
        <div style="
          font-size:10px;
          margin-bottom:5px;
          opacity:.85;
        ">
          Цель: <b>${targetActor.name}</b>
        </div>

        <label style="
          display:flex;
          gap:7px;
          align-items:center;
          cursor:pointer;
        ">
          <input
            id="bcColdHeartedSeduction"
            type="checkbox"
          >

          Это попытка соблазнения
        </label>

        <div
          id="bcColdHeartedSeductionInfo"
          style="
            font-size:10px;
            margin-top:5px;
            opacity:.8;
            line-height:1.35;
          "
        ></div>
      </div>
    `;

    modifierRow.after(row);

    const checkbox =
      row.querySelector(
        "#bcColdHeartedSeduction"
      );

    const info =
      row.querySelector(
        "#bcColdHeartedSeductionInfo"
      );

    function updateInfo() {
      if (checkbox.checked) {
        info.textContent =
          "Cold Hearted: попытка соблазнения автоматически провалится. Кубик не бросается.";
      } else {
        info.textContent =
          "Обычное Обаяние: бросок выполняется нормально.";
      }
    }

    checkbox.addEventListener(
      "change",
      updateInfo
    );

    updateInfo();

    let resolved = false;

    dialog.addEventListener(
      "click",
      async event => {
        if (!checkbox.checked) return;
        if (resolved) return;

        const button =
          event.target.closest("button");

        if (!button) return;

        const text =
          normalize(button.textContent);

        const action =
          normalize(button.dataset?.action);

        const isRollButton =
          text.includes("бросок") ||
          text.includes("roll") ||
          action === "roll" ||
          action === "yes" ||
          action === "submit";

        if (!isRollButton) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        resolved = true;

        await ChatMessage.create({
          content: `
            <h3 style="color:#c44;">
              COLD HEARTED
            </h3>

            <p>
              <b>Автоматический провал</b>
            </p>

            <p>
              Попытка соблазнения против
              <b>${targetActor.name}</b>
              автоматически проваливается.
            </p>

            ${
              attacker
                ? `<p>Инициатор: ${attacker.name}</p>`
                : ""
            }

            <p>
              <i>Бросок d100 не производится.</i>
            </p>
          `
        });

        ui.notifications.warn(
          `Cold Hearted: соблазнение против ${targetActor.name} автоматически провалено.`
        );

        try {
          dialog.close();
        } catch (error) {
          console.warn(
            "Black Crusade Automation | Could not close Charm dialog after Cold Hearted auto-fail.",
            error
          );
        }
      },
      true
    );

    console.log(
      "Black Crusade Automation | Cold Hearted seduction auto-fail injected",
      {
        target: targetActor.name,
        attacker: attacker?.name
      }
    );
  }

  async function applyCorruptionOnce(actor) {
    if (!actor) return false;
    if (!hasTalent(actor)) return false;

    const alreadyApplied =
      actor.getFlag(
        MODULE_ID,
        CORRUPTION_FLAG
      );

    if (alreadyApplied) return false;

    const current =
      Number(actor.system?.corruption) || 0;

    await actor.update({
      "system.corruption": current + 1
    });

    await actor.setFlag(
      MODULE_ID,
      CORRUPTION_FLAG,
      true
    );

    await ChatMessage.create({
      content: `
        <h3>COLD HEARTED</h3>
        <p><b>${actor.name}</b></p>
        <p>Порча: ${current} → <b>${current + 1}</b></p>
        <p>Эффект применён один раз при получении таланта.</p>
      `
    });

    ui.notifications.info(
      `Cold Hearted: Порча ${current} → ${current + 1}`
    );

    return true;
  }

  function scan() {
    document
      .querySelectorAll(
        "dialog.dark-heresy-dialog"
      )
      .forEach(dialog => {
        injectWillpowerBonus(dialog);
        injectSeductionAutoFail(dialog);
      });
  }

  function start() {
    STATE.observer?.disconnect();

    scan();

    STATE.observer =
      new MutationObserver(scan);

    STATE.observer.observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );

    console.log(
      "Black Crusade Automation | Cold Hearted active"
    );
  }

  Hooks.on(
    "createItem",
    async (item, options, userId) => {
      // Only the client that created the embedded talent applies Corruption,
      // preventing multiple connected clients from applying it repeatedly.
      if (game.user.id !== userId) return;
      if (!isColdHeartedItem(item)) return;

      const actor = item.parent;

      if (!actor || actor.documentName !== "Actor") {
        return;
      }

      try {
        await applyCorruptionOnce(actor);
      } catch (error) {
        console.error(
          "Black Crusade Automation | Failed to apply Cold Hearted corruption.",
          error
        );

        ui.notifications.error(
          "Cold Hearted: не удалось автоматически добавить +1 Порчу."
        );
      }
    }
  );

  Hooks.once("ready", start);

  globalThis.BCAColdHearted = {
    start,
    scan,
    hasTalent,
    applyCorruptionOnce
  };
})();
