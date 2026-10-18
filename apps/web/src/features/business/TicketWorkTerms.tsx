import { useState } from "react";
import type {
  TicketWorkflow,
  TicketTermsInput,
} from "../../../../../packages/contracts/src/business-workflows";
import type { AccountingWorkspace } from "../../../../../packages/contracts/src/accounting";
import { MAX_WORK_AMOUNT } from "../../../../../packages/contracts/src/operations-platform";
import { Button, Checkbox, Input, Select } from "../../ui";

export function TicketWorkTerms({
  workflow: w,
  leaseId,
  accounts,
  busy,
  onSave,
}: {
  workflow: Omit<TicketWorkflow, "amount"> & { amount: number | null };
  leaseId?: string | null;
  accounts: AccountingWorkspace;
  busy: boolean;
  onSave: (body: TicketTermsInput) => void;
}) {
  const [baseline] = useState(w);
  const [paid, setPaid] = useState(w.paid),
    [amount, setAmount] = useState(String(w.amount ?? 0));
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
        const values = new FormData(e.currentTarget);
        onSave({
          updatedAt: baseline.updatedAt,
          paid,
          amount: paid ? Number(amount) : 0,
          accountId: String(values.get("accountId") || "") || null,
          requireBeforePhoto: values.get("before") === "on",
          requireAfterPhoto: values.get("after") === "on",
        });
      }}
    >
      <Checkbox
        checked={paid}
        disabled={Boolean(w.estimateId)}
        onChange={(e) => {
          setPaid(e.target.checked);
          if (!e.target.checked) setAmount("0");
        }}
      >
        Платная работа
      </Checkbox>
      <label>
        Стоимость, ₽
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!paid}
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
          defaultValue={w.accountId ?? ""}
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
        <Checkbox name="before" defaultChecked={w.requireBeforePhoto}>
          До начала работ
        </Checkbox>
        <Checkbox name="after" defaultChecked={w.requireAfterPhoto}>
          После выполнения
        </Checkbox>
      </fieldset>
      <div className="mvp-actions work-terms-actions">
        <Button
          variant="primary"
          type="submit"
          busy={busy}
          disabled={paid && !eligible.length}
        >
          Сохранить условия
        </Button>
      </div>
    </form>
  );
}
