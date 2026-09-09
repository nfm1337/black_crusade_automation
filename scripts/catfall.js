// Catfall automation for Black Crusade Automation / Apex Heresy
(() => {
  const TALENT = {
    id: "WkQMLFWzaG89oYvS",
    name: "Catfall",
    source: "Compendium.dark-heresy.black-crusade.Item.WkQMLFWzaG89oYvS"
  };

  const STATE = { observer: null };

  const normalize = value => String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ");

  function getActor() {
    const bca = globalThis.BlackCrusadeAutomation;
    return bca?.getActor?.()
      ?? canvas?.tokens?.controlled?.[0]?.actor
      ?? game.user?.character
      ?? null;
  }

  function hasTalent(actor) {
    if (!actor?.items) return false;

    const bca = globalThis.BlackCrusadeAutomation;
    if (bca?.hasTalent) {
      return bca.hasTalent(actor, [TALENT.name], TALENT.source);
    }

    return actor.items.some(item => {
      if (item.type !== "talent") return false;
      const source = item._stats?.compendiumSource ?? "";
      return item.id === TALENT.id
        || normalize(item.name) === normalize(TALENT.name)
        || source === TALENT.source
        || source.endsWith(`.Item.${TALENT.id}`);
    });
  }

  function getAgilityBonus(actor) {
    const agility = actor?.characteristics?.agility
      ?? actor?.system?.characteristics?.agility;
    if (!agility) return 0;

    const prepared = Number(agility.displayBonus ?? agility.bonus);
    if (Number.isFinite(prepared)) return prepared;

    const total = Number(
      agility.displayTotal
      ?? agility.total
      ?? (
        (Number(agility.base) || 0)
        + (Number(agility.advance) || 0)
        + (Number(agility.tempModifier) || 0)
      )
    ) || 0;

    const unnatural = Number(agility.unnatural) || 0;
    return Math.floor(Math.max(total, 0) / 10) + unnatural;
  }

  function isAcrobaticsDialog(dialog) {
    const title = normalize(
      dialog.querySelector(".window-title")?.textContent
      ?? dialog.getAttribute("aria-label")
      ?? ""
    );

    return title.includes("acrobatics") || title.includes("акробатика");
  }

  function inject(dialog) {
    if (!(dialog instanceof HTMLElement)) return;

    const modifier = dialog.querySelector("#modifier");
    const difficulty = dialog.querySelector("#difficulty");
    if (!modifier || !difficulty) return;

    if (dialog.querySelector("#damageFormula")) return;
    if (!isAcrobaticsDialog(dialog)) return;
    if (dialog.querySelector("#bcCatfallRow")) return;

    const actor = getActor();
    if (!actor || !hasTalent(actor)) return;

    const agilityBonus = getAgilityBonus(actor);
    const modifierRow = modifier.parentElement;
    if (!modifierRow) return;

    const row = document.createElement("div");
    row.className = modifierRow.className;
    row.id = "bcCatfallRow";
    row.innerHTML = `
      <label style="align-self:start;">CATFALL</label>
      <div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:5px;">
          <span>Высота падения:</span>
          <input id="bcCatfallDistance" type="number" min="0" step="1" value="0" style="width:65px;">
          <span>м</span>
        </div>

        <label style="display:flex;gap:7px;align-items:center;cursor:pointer;">
          <input id="bcCatfallJump" type="checkbox">
          Jump для снижения урона (+20)
        </label>

        <div id="bcCatfallInfo"
             style="font-size:10px;margin-top:5px;opacity:.8;line-height:1.35;"></div>
      </div>
    `;

    modifierRow.after(row);

    const distanceInput = row.querySelector("#bcCatfallDistance");
    const jumpCheckbox = row.querySelector("#bcCatfallJump");
    const info = row.querySelector("#bcCatfallInfo");

    let manualModifier = Number.parseInt(modifier.value, 10);
    if (Number.isNaN(manualModifier)) manualModifier = 0;

    let automationModifier = 0;
    let internalChange = false;

    function rememberManualModifier() {
      if (internalChange) return;
      let current = Number.parseInt(modifier.value, 10);
      if (Number.isNaN(current)) current = 0;
      manualModifier = current - automationModifier;
    }

    modifier.addEventListener("input", rememberManualModifier);
    modifier.addEventListener("change", rememberManualModifier);

    function apply() {
      const fallDistance = Math.max(Number(distanceInput.value) || 0, 0);
      const effectiveDistance = Math.max(fallDistance - agilityBonus, 0);

      automationModifier = jumpCheckbox.checked ? 20 : 0;
      const total = manualModifier + automationModifier;

      internalChange = true;
      modifier.value = total;
      modifier.dispatchEvent(new Event("input", { bubbles: true }));
      modifier.dispatchEvent(new Event("change", { bubbles: true }));
      internalChange = false;

      const fallText = fallDistance > 0
        ? `Catfall: AgB ${agilityBonus}. ${fallDistance} м → ${effectiveDistance} м.`
        : `Agility Bonus: ${agilityBonus}.`;

      const jumpText = jumpCheckbox.checked
        ? " Jump: +20 к Акробатике."
        : " Jump не используется.";

      info.textContent =
        fallText + jumpText + ` Итог модификатора: ${total >= 0 ? "+" : ""}${total}`;
    }

    distanceInput.addEventListener("input", apply);
    distanceInput.addEventListener("change", apply);
    jumpCheckbox.addEventListener("change", apply);
    apply();
  }

  function scan() {
    document.querySelectorAll("dialog.dark-heresy-dialog").forEach(inject);
  }

  function start() {
    STATE.observer?.disconnect();
    scan();
    STATE.observer = new MutationObserver(scan);
    STATE.observer.observe(document.body, { childList: true, subtree: true });
    console.log("Black Crusade Automation | Catfall active");
  }

  Hooks.once("ready", start);
  globalThis.BCACatfall = { start, scan, hasTalent };
})();
