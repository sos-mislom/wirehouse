import { Button, Input, Select } from "../../ui";
import { resourceNames, specialtyNames, tabs } from "./shared";
import type { OperationsModel } from "./useOperationsModel";
import {
  permissionLabels,
  rolePermissions,
  hasPermission,
} from "../../../../../packages/contracts/src/permissions";
import { TemplateSelect } from "../platform/TemplateSelect";
export function OperationEditor({ model }: { model: OperationsModel }) {
  const {
    draft,
    tab,
    save,
    input,
    select,
    user,
    overview,
    check,
    setDraft,
    units,
    workers,
    area,
    setError,
    change,
    data,
    busy,
  } = model;
  if (!draft) return null;
  return (
    <article className="mvp-card">
      <h3>
        {draft.id ? "Редактирование" : "Новая запись"} · {tabs[tab]}
      </h3>
      <form className="form-grid" onSubmit={save}>
        {tab === "users" ? (
          <>
            {input("fullName", "Имя", "text", true)}
            {input("email", "Email", "email", draft.role !== "tenant")}
            {input("phone", "Телефон")}
            {input(
              "password",
              "Новый пароль",
              "password",
              false,
              "Оставьте пустым, чтобы сохранить пароль; новый — от 10 символов.",
            )}
            {select(
              "role",
              "Роль",
              draft.role === "tenant"
                ? { tenant: "Арендатор" }
                : user.role === "admin"
                  ? {
                      admin: "Администратор",
                      manager: "Менеджер",
                      worker: "Исполнитель",
                    }
                  : { worker: "Исполнитель" },
              true,
            )}
            {!["admin", "tenant"].includes(draft.role) &&
              select(
                "propertyId",
                "Объект",
                Object.fromEntries(
                  overview.properties.map((p) => [p.id, p.name]),
                ),
                true,
              )}
            {draft.role !== "tenant" &&
              select("specialty", "Специализация", specialtyNames)}
            {check("isActive", "Учётная запись активна")}
            {hasPermission(user, "permissions.manage") &&
              draft.id !== user.id && (
                <fieldset className="platform-permissions">
                  <legend>Права доступа</legend>
                  {(rolePermissions[draft.role] ?? []).map((p) => (
                    <label key={p}>
                      <Input
                        type="checkbox"
                        checked={(
                          draft.permissions ?? rolePermissions[draft.role]
                        ).includes(p)}
                        onChange={(e) =>
                          change(
                            "permissions",
                            e.target.checked
                              ? [
                                  ...(draft.permissions ??
                                    rolePermissions[draft.role]),
                                  p,
                                ]
                              : (
                                  draft.permissions ??
                                  rolePermissions[draft.role]
                                ).filter((v: string) => v !== p),
                          )
                        }
                      />
                      {permissionLabels[p]}
                    </label>
                  ))}
                </fieldset>
              )}
          </>
        ) : (
          <>
            {input("name", "Название", "text", true)}
            <label>
              <span>Объект *</span>
              <Select
                required
                disabled={Boolean(draft.id)}
                value={draft.propertyId}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    propertyId: event.target.value,
                    unitId: "",
                    equipmentId: "",
                    responsibleId: "",
                  })
                }
              >
                {overview.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            {["equipment", "plans", "meters"].includes(tab) && (
              <>
                {select(
                  "unitId",
                  tab === "meters" && draft.scope === "common"
                    ? "Помещение установки (необязательно)"
                    : "Помещение",
                  units,
                  tab !== "meters" || draft.scope === "individual",
                )}
                {select("responsibleId", "Ответственный", workers)}
              </>
            )}
            {tab === "equipment" && (
              <>
                {input("type", "Тип оборудования", "text", true)}
                {input("serialNumber", "Инвентарный / серийный номер")}
                {input("cost", "Стоимость, ₽", "number")}
                {input("warrantyUntil", "Гарантия до", "date")}
                {select(
                  "status",
                  "Состояние",
                  {
                    active: "В эксплуатации",
                    maintenance: "На обслуживании",
                    retired: "Списано",
                  },
                  true,
                )}
                {input("photoUrl", "Фотография (HTTPS)")}
                {area("specifications", "Технические характеристики")}
                <label>
                  <span>Загрузить фото (до 2 МБ)</span>
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        setError("Фото должно быть не больше 2 МБ");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => change("photoUrl", reader.result);
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </>
            )}
            {tab === "plans" && (
              <>
                <TemplateSelect
                  token={model.token}
                  propertyId={draft.propertyId}
                  value={draft.templateId ?? ""}
                  onSelect={(template) =>
                    setDraft({
                      ...draft,
                      templateId: template?.id ?? null,
                      templateVersion: template?.version ?? null,
                      ...(template
                        ? {
                            checklist: template.checklist!.join("\n"),
                            instructions: template.instructions,
                          }
                        : {}),
                    })
                  }
                />
                {select(
                  "equipmentId",
                  "Оборудование",
                  Object.fromEntries(
                    data.equipment
                      .filter(
                        (e) =>
                          e.unitId === draft.unitId && e.status !== "retired",
                      )
                      .map((e) => [e.id, e.name || ""]),
                  ),
                )}
                {input("nextDate", "Следующее выполнение", "date", true)}
                {select(
                  "recurrence",
                  "Повторение",
                  {
                    days: "Дни",
                    weeks: "Недели",
                    months: "Месяцы",
                    years: "Годы",
                  },
                  true,
                )}
                {input("intervalCount", "Каждые N периодов", "number", true)}
                {input("leadDays", "Создавать за, дней", "number", true)}
                {input("endDate", "Последняя дата графика", "date")}
                {area("checklist", "Чек-лист: один пункт на строку", true)}
                {area("instructions", "Инструкция")}
                {check("active", "Генерировать заявки автоматически")}
                <p className="field-hint">
                  В указанную дату создаётся заявка с чек-листом и
                  ответственным. Повторная проверка расписания не создаёт
                  дубликатов.
                </p>
              </>
            )}
            {tab === "services" && (
              <>
                {check("paid", "Платная услуга")}
                {input("basePrice", "Базовая цена, ₽", "number")}
                {input("hourlyRate", "Тариф часа, ₽", "number")}
                {select("specialty", "Специализация", specialtyNames)}
                {area("description", "Состав услуги и правила обработки")}
                {check("active", "Доступна в каталоге")}
                <p className="field-hint">
                  Стоимость работ = часы × тариф + ТМЦ. Для платных услуг к
                  оплате добавляется базовая цена; для бесплатных ведётся только
                  внутренний учёт затрат.
                </p>
              </>
            )}
            {tab === "meters" && (
              <>
                {select(
                  "scope",
                  "Назначение",
                  {
                    individual: "Индивидуальный",
                    common: "Общедомовой / МОП",
                  },
                  true,
                )}
                {select("resource", "Ресурс", resourceNames, true)}
                {input("serialNumber", "Заводской номер")}
                {input("tariff", "Тариф за единицу, ₽", "number", true)}
                {input("initialValue", "Начальное показание", "number", true)}
                {check("active", "Принимать показания")}
                <p className="field-hint">
                  Общедомовой расход распределяется по площади и дням аренды.
                  История хранит тариф и доли на момент ввода; изменение тарифа
                  действует на новые показания.
                </p>
              </>
            )}
            {tab === "news" && (
              <>
                {select(
                  "audience",
                  "Кому показывать",
                  {
                    all: "Всем",
                    staff: "Сотрудникам",
                    tenants: "Арендаторам",
                  },
                  true,
                )}
                {select(
                  "tone",
                  "Важность",
                  {
                    info: "Информация",
                    warning: "Требует внимания",
                    critical: "Критично",
                    success: "Успешно",
                  },
                  true,
                )}
                {input("expiresAt", "Показывать до", "date")}
                {area("content", "Текст объявления", true)}
                {check("published", "Опубликовано")}
              </>
            )}
            {tab === "expenses" && (
              <>
                {input("date", "Дата расхода", "date", true)}
                {input("amount", "Сумма, ₽", "number", true)}
                {input("category", "Категория")}
                <p className="field-hint">
                  Расход попадёт в расчёт чистого операционного дохода на
                  дашборде. Вносите сюда все расходы, включая затраты по
                  заявкам, один раз.
                </p>
              </>
            )}
          </>
        )}
        <div className="mvp-actions form-wide">
          <Button
            variant="primary"
            className="primary-button"
            type="submit"
            disabled={busy}
          >
            {busy ? "Сохраняем…" : "Сохранить"}
          </Button>
          <Button
            variant="secondary"
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => setDraft(null)}
          >
            Отмена
          </Button>
        </div>
      </form>
    </article>
  );
}
