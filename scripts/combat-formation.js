// Combat Formation automation for Black Crusade Automation / Apex Heresy
// Tested in Apex:
// - All selected group members gain +1 Initiative.
// - Any selected group member may use the Combat Formation owner's Intelligence Bonus
//   instead of their own Agility Bonus for Initiative.

(() => {
  const TALENT = {
    id: "Fvvd4CVSdVMY1kjA",
    name: "Combat Formation",
    source: "Compendium.dark-heresy.black-crusade.Item.Fvvd4CVSdVMY1kjA"
  };

  function normalize(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/\s+/g, " ");
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

    return actor.items.some(item => {
      if (item.type !== "talent") return false;

      const source =
        item._stats?.compendiumSource ?? "";

      return (
        item.id === TALENT.id ||
        normalize(item.name) === normalize(TALENT.name) ||
        source === TALENT.source ||
        source.endsWith(`.Item.${TALENT.id}`)
      );
    });
  }

  function characteristicBonus(actor, key) {
    const bca = globalThis.BlackCrusadeAutomation;

    if (bca?.characteristicBonus) {
      try {
        const bonus = Number(
          bca.characteristicBonus(actor, key)
        );

        if (Number.isFinite(bonus)) {
          return bonus;
        }
      } catch (_) {
        // Fall through to local calculation.
      }
    }

    const characteristic =
      actor?.characteristics?.[key]
      ?? actor?.system?.characteristics?.[key];

    if (!characteristic) return 0;

    const prepared =
      Number(
        characteristic.displayBonus ??
        characteristic.bonus
      );

    if (Number.isFinite(prepared)) {
      return prepared;
    }

    const total =
      Number(
        characteristic.displayTotal ??
        characteristic.total ??
        (
          (Number(characteristic.base) || 0) +
          (Number(characteristic.advance) || 0) +
          (Number(characteristic.tempModifier) || 0)
        )
      ) || 0;

    const unnatural =
      Number(characteristic.unnatural) || 0;

    return (
      Math.floor(
        Math.max(total, 0) / 10
      ) + unnatural
    );
  }

  function getLeaderToken() {
    return canvas?.tokens?.controlled?.[0] ?? null;
  }

  function getGroupTokens(leaderToken) {
    return [
      leaderToken,
      ...(game.user?.targets ?? [])
    ].filter(
      (token, index, array) =>
        token &&
        array.findIndex(t => t.id === token.id) === index
    );
  }

  async function rollGroupInitiative() {
    const leaderToken = getLeaderToken();

    if (!leaderToken?.actor) {
      ui.notifications.error(
        "Combat Formation: выдели токен владельца таланта."
      );
      return;
    }

    const leader = leaderToken.actor;

    if (!hasTalent(leader)) {
      ui.notifications.error(
        `${leader.name}: Combat Formation не найден.`
      );
      return;
    }

    const combat = game.combat;

    if (!combat) {
      ui.notifications.error(
        "Combat Formation: сначала создай бой в Combat Tracker."
      );
      return;
    }

    const groupTokens =
      getGroupTokens(leaderToken);

    const group = [];

    for (const token of groupTokens) {
      const combatant =
        combat.combatants.find(
          c => c.tokenId === token.id
        );

      if (!combatant) {
        ui.notifications.error(
          `${token.name} не добавлен в Combat Tracker.`
        );
        return;
      }

      group.push({
        token,
        actor: token.actor,
        combatant
      });
    }

    const leaderIntB =
      characteristicBonus(
        leader,
        "intelligence"
      );

    for (const member of group) {
      const agB =
        characteristicBonus(
          member.actor,
          "agility"
        );

      member.agilityBonus = agB;

      member.useLeaderInt =
        window.confirm(
          `COMBAT FORMATION\n\n` +
          `${member.actor.name}\n\n` +
          `Agility Bonus: ${agB}\n` +
          `${leader.name} Intelligence Bonus: ${leaderIntB}\n\n` +
          `Использовать IntB ${leaderIntB} вместо AgB ${agB}?`
        );
    }

    const ids =
      group.map(
        member => member.combatant.id
      );

    // Let Apex roll its normal initiative first.
    await combat.rollInitiative(ids);

    const results = [];

    for (const member of group) {
      const combatant =
        combat.combatants.get(
          member.combatant.id
        );

      const apexInitiative =
        Number(combatant.initiative);

      if (!Number.isFinite(apexInitiative)) {
        ui.notifications.error(
          `Не удалось получить инициативу ${member.actor.name}.`
        );
        continue;
      }

      // Everyone gets +1.
      let delta = 1;

      // Optional replacement: own AgB -> leader IntB.
      if (member.useLeaderInt) {
        delta +=
          leaderIntB -
          member.agilityBonus;
      }

      const finalInitiative =
        apexInitiative + delta;

      await combat.setInitiative(
        combatant.id,
        finalInitiative
      );

      results.push({
        name: member.actor.name,
        apexInitiative,
        agilityBonus: member.agilityBonus,
        useLeaderInt: member.useLeaderInt,
        leaderIntB,
        finalInitiative
      });
    }

    const rows = results.map(result => {
      const replacement =
        result.useLeaderInt
          ? `
            <li>
              AgB ${result.agilityBonus}
              → IntB ${result.leaderIntB}
            </li>
          `
          : `
            <li>
              Используется собственный
              AgB ${result.agilityBonus}
            </li>
          `;

      return `
        <div style="
          margin-bottom:10px;
          padding-bottom:8px;
          border-bottom:1px solid #555;
        ">
          <b>${result.name}</b>

          <ul>
            <li>
              Инициатива Apex:
              ${result.apexInitiative}
            </li>

            ${replacement}

            <li>
              Combat Formation:
              +1
            </li>

            <li>
              <b>
                Итог:
                ${result.finalInitiative}
              </b>
            </li>
          </ul>
        </div>
      `;
    }).join("");

    await ChatMessage.create({
      content: `
        <h3>COMBAT FORMATION</h3>

        <p>
          <b>Лидер:</b>
          ${leader.name}
        </p>

        <p>
          Intelligence Bonus лидера:
          <b>${leaderIntB}</b>
        </p>

        ${rows}
      `
    });

    ui.notifications.info(
      "Combat Formation: инициатива группы рассчитана."
    );
  }

  Hooks.once("ready", () => {
    console.log(
      "Black Crusade Automation | Combat Formation ready"
    );
  });

  globalThis.BCACombatFormation = {
    rollGroupInitiative,
    hasTalent,
    characteristicBonus
  };
})();
