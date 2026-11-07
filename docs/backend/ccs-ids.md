# CCS: идентификаторы проекта ZAG

Источник: вывод `getPrograms()` живого CCS (учётка `zag`, 2026-11-07),
группа STATE целиком в [`ccs-state-group.json`](ccs-state-group.json).
В коде: `apps/server/src/ccs-ids.ts` — значения по умолчанию для
`CCS_STATE_GROUP` / `CCS_PROGRAM_*`, env их переопределяет.

| Что                                                   | Значение                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `CCS_PROJECT_ID` — id проекта ZAG: логин, `joinRoom`, `getPrograms`; при логине сверяется со списком `/api/user/projects` учётки | `676ed9a3108c970013dcb321` |

## Группа «Public app state» — свичи состояния (`CCS_STATE_GROUP`)

`_id` группы `6aef145253257f190d66c47b`, type `REGULAR`. Каждый свич —
программа `SWITCH` со `state.value` 0/1; изменения приходят событием
`programStateChange` `{ groupID, programID, value }` и применяются
`AppState.apply`.

| Флаг                  | Имя в CCS            | `programID`    | Константа                                |
| --------------------- | -------------------- | -------------- | ---------------------------------------- |
| `techPause`           | Maintenance          | `qduuwcanagbl` | `CCS_STATE_PROGRAMS.techPause`           |
| `interactive`         | Allow interactive    | `qxcsxqatyupx` | `CCS_STATE_PROGRAMS.interactive`         |
| `locationRestriction` | Location restriction | `azpuqosabwug` | `CCS_STATE_PROGRAMS.locationRestriction` |
| `schedule`            | Schedule             | `edbyrttglacr` | `CCS_STATE_PROGRAMS.schedule`            |

Семантика `Schedule = 1` принята как «вне графика» → экран `schedule`
(см. `shared-modules.md` § 3); если в CCS свич означает обратное,
инвертировать в `ZagAppState.resolveScreen`.

## Группа «Public app controls» — кнопки (`CCS_CONTROL_PROGRAMS`)

`state: null`, на флаги не влияют; приложение дёргает их через
`execCommand`. `_id` группы **[уточнить]**.

| Программа     | `programID`    | type                             |
| ------------- | -------------- | -------------------------------- |
| Session start | `ospyruigxyop` | `WITH_PARAMS` (параметры сеанса) |
| Session end   | `fwzxaqlwzwbu` | `COMMAND`                        |

## `.env` для dry-run / live

```dotenv
CCS_MODE=dry-run
CCS_LOGIN=zag
CCS_PASSWORD=…
# проект, CCS_STATE_GROUP и CCS_PROGRAM_* — константы ccs-ids.ts
```
