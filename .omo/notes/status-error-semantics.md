# Статус задачи: семантика ошибок тулов (completed_with_errors)

## Решение (согласовано с пользователем)
- Падение тула внутри сессии исполнителя НЕ означает автоматически `failed` — агенты
  пересылают ошибку, фолбэк-плагин OpenCode перепосылает на другую модель, задача может
  реально довестись. Ставить `failed` на любой упавший тул = ложноотрицательный шум.
- Текущий маппинг `time.completed -> completed` (плюс выкидывание tool-ошибок) — нарушение
  семантики: теряется сигнал об ошибке, Claude видит "успех" там, где был сбой, и жалуется,
  что исполнитель "молча завершил работу с completed".
- Правильная семантика — три состояния:
  - `failed` — весь заход умер: `entry.info.error` есть, либо сессия абортнута и не возобновилась.
  - `completed` — дошёл до конца, финальный текст — реальный результат, фатальных tool-ошибок нет.
  - `completed_with_errors` (НОВЫЙ) — дошёл до конца и выдал текст, но в `parts` есть `tool` с
    `state.status === "error"`. Отдавать статус + текст ошибки тула, чтобы Claude сам решил,
    доверять ли результату.

## Корень (где умалчиваем об ошибке)
Тип тула из SDK: `ToolStateError { status: "error"; error: string; ... }` (НЕ `"failed"`!).
Поле ошибки — `state.error: string` (dist/gen/types.gen.d.ts:248-261).

1. `src/modules/shared/opencode-client.ts:159-161` `deriveTaskStatus`:
   `if (entry.info.time.completed) return { status: "completed" }` — не смотрит в `entry.parts`
   на `ToolStateError`. ВЛИЯЕТ НА: `get_task_status`, `list_tasks`, `wait_for_task` (все три
   дергают deriveTaskStatus).
2. `src/modules/tools/get_task_result.ts:39-44`: собирает только `type: "text"` части ->
   `result: text`. `ToolStateError.error` выбрасывается, статус `completed`.
3. `src/modules/shared/opencode-client.ts:84-97` `buildProgress`: считает только `completed`,
   трекает `running|pending`. `ToolStateError` не попадает ни в `text_snippet`, ни в
   `current_tool`. Скрывает ошибку даже при `include_progress`.
4. (смежно) `entry.info.error` ставится только на abort уровня сессии. Если фолбэк абортнул
   заход и позже тот же sessionId завершился успешно (на Flash) — `info.error` пустой,
   lastAssistantEntry берёт завершённое сообщение -> `completed`. Путь `failed` в этом сценарии
   недостижим -> тихо отдаём completed.

## Фикс (набросок, НЕ применён)
- `deriveTaskStatus`: после проверки `info.error` и перед `time.completed`, отсканировать
  `entry.parts` на `part.type === "tool" && part.state.status === "error"`. Если есть и
  `time.completed` -> `status: "completed_with_errors"`, добавить `errors: string[]`.
- `get_task_result`: то же сканирование; при наличии `ToolStateError` отдавать
  `status: "completed_with_errors"` + `result: text` + `tool_errors: string[]`.
- `buildProgress`: считать `ToolStateError` (положить в snippet / добавить счётчик), чтобы
  `include_progress` показывал сбой.
- Тип `TaskStatus` расширить: добавить `"completed_with_errors"`. `FINISHED_STATUSES`
  (wait_for_task.ts:20) и isFinished — добавить новый статус.
- Обновить тесты (порог покрытия 100%: lines/branches/functions/statements).

## Не трогать
- `start_task` — не маскирует ошибки (возвращает `pending`/`error` корректно).
- `wait_for_task` таймаут/отмена — корректно (`timed_out`/`cancelled`).
- `continue_task` / `cancel_task` — не принимают решений о статусе.
