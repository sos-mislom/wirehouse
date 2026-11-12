import { useEffect, useState } from "react";
import type {
  TicketWorkflow,
  TicketTermsInput,
} from "../../../../../packages/contracts/src/business-workflows";
import type { AccountingWorkspace } from "../../../../../packages/contracts/src/accounting";
import { MAX_WORK_AMOUNT } from "../../../../../packages/contracts/src/operations-platform";
import { Button, Checkbox, Input, Select } from "../../ui";

type Workflow = Omit<TicketWorkflow, "amount"> & { amount: number | null };
const draftFor = (w: Workflow) => ({
  paid: w.paid,
  amount: String(w.amount ?? 0),
  accountId: w.accountId ?? "",
  before: w.requireBeforePhoto,
  after: w.requireAfterPhoto,
});

export function TicketWorkTerms({
  workflow: w,
  leaseId,
  accounts,
  busy,
  onSave,
}: {
  workflow: Workflow;
  leaseId?: string | null;
  accounts: AccountingWorkspace;
  busy: boolean;
  onSave: (body: TicketTermsInput) => void;
}) {
  const [baseline, setBaseline] = useState(w);
  const [draft, setDraft] = useState(() => draftFor(w));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFor(baseline));
  const stale = dirty && w.updatedAt !== baseline.updatedAt;
  const { paid, amount } = draft;
  useEffect(() => {
    if (!dirty && w.updatedAt !== baseline.updatedAt) {
      setBaseline(w);
      setDraft(draftFor(w));
    }
  }, [w, baseline.updatedAt, dirty]);
  const today = new Date().toISOString().slice(0, 10),
    eligible = accounts.accounts.filter(
      (a) =>
        a.leaseId === leaseId &&
        a.status === "active" &&
        a.validFrom <= today &&
        (!a.validTo || a.validTo >= today) &&
        accounts.sources.some((s) => s.id === a.sourceId && s.active),
    );
  return (
    <form
      className="form-grid ticket-work-terms"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || stale) return;
        onSave({
          updatedAt: baseline.updatedAt,
          paid,
          amount: paid ? Number(amount) : 0,
          accountId: draft.accountId || null,
          requireBeforePhoto: draft.before,
          requireAfterPhoto: draft.after,
        });
      }}
    >
      <Checkbox
        checked={paid}
        disabled={busy || Boolean(w.estimateId)}
        onChange={(e) => {
          setDraft({
            ...draft,
            paid: e.target.checked,
            amount: e.target.checked ? amount : "0",
          });
        }}
      >
        Платная работа
      </Checkbox>
      <label>
        Стоимость, ₽
        <Input
          type="number"
          value={amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          disabled={busy || !paid}
          readOnly={Boolean(w.estimateId)}
          min={paid ? "0.01" : "0"}
          max={MAX_WORK_AMOUNT}
          step="0.01"
          required
        />
      </label>
      {w.estimateId && (
        <p className="field-hint">
          Стоимость и состав работы определены актуальной сметой. Изменения
          оформляются в смете до начала работ.
        </p>
      )}
      <label className="work-account">
        Лицевой счет
        <Select
          name="accountId"
          required={paid}
          value={draft.accountId}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
        >
          <option value="">Без ЛС</option>
          {eligible.map((a) => (
            <option key={a.id} value={a.id}>
              {a.number} ·{" "}
              {accounts.sources.find((s) => s.id === a.sourceId)?.name}
            </option>
          ))}
        </Select>
      </label>
      {paid && !eligible.length && (
        <p className="field-hint">
          Для платной работы нужен действующий лицевой счет договора. Его можно
          добавить в разделе «Платежи».
        </p>
      )}
      <fieldset className="work-photo-policy">
        <legend>Обязательные фотографии</legend>
        <Checkbox
          name="before"
          checked={draft.before}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, before: e.target.checked })}
        >
          До начала работ
        </Checkbox>
        <Checkbox
          name="after"
          checked={draft.after}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, after: e.target.checked })}
        >
          После выполнения
        </Checkbox>
      </fieldset>
      <div className="mvp-actions work-terms-actions">
        {stale && (
          <>
            <p className="field-hint" role="alert">
              Условия заявки изменились. Обновите их перед сохранением.
            </p>
            <Button
              type="button"
              onClick={() => {
                setBaseline(w);
                setDraft(draftFor(w));
              }}
            >
              Обновить условия
            </Button>
          </>
        )}
        <Button
          variant="primary"
          type="submit"
          busy={busy}
          disabled={stale || (paid && !eligible.length)}
        >
          Сохранить условия
        </Button>
      </div>
    </form>
  );
}
