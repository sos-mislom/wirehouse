import { useWorkspace } from "../../app/WorkspaceContext";
import { type AdminPanel, type ManagerScreen } from "../../shared/types";
import { Button } from "../../ui";
import { AdminForm } from "../administration/AdminForm";
export function ManagerFormScreen({
  screen,
  backScreen,
}: {
  screen: "tenant-add" | "property-add" | "unit-add" | "lease-add";
  backScreen: ManagerScreen;
}) {
  const {
    editingAdmin,
    adminSaveChangesLabel,
    managerUi,
    cancelAdminEdit,
    setManagerScreen,
  } = useWorkspace();

  const panel: AdminPanel =
    screen === "tenant-add"
      ? "tenant"
      : screen === "property-add"
        ? "property"
        : screen === "unit-add"
          ? "unit"
          : "lease";
  const isEditing = Boolean(editingAdmin[panel]);
  const title = isEditing
    ? adminSaveChangesLabel
    : screen === "tenant-add"
      ? managerUi.titles.tenantAdd
      : screen === "property-add"
        ? managerUi.titles.propertyAdd
        : screen === "unit-add"
          ? managerUi.titles.unitAdd
          : managerUi.titles.leaseAdd;
  const subtitle =
    screen === "tenant-add"
      ? managerUi.subtitles.tenantAdd
      : screen === "property-add"
        ? managerUi.subtitles.propertyAdd
        : screen === "unit-add"
          ? managerUi.subtitles.unitAdd
          : managerUi.subtitles.leaseAdd;

  return (
    <section className="mvp-page">
      <div className="mvp-detail-head">
        <Button
          variant="plain"
          className="mvp-back"
          onClick={() => {
            if (isEditing) {
              cancelAdminEdit(panel);
            }
            if (!isEditing) setManagerScreen(backScreen);
          }}
          type="button"
        >
          {managerUi.back}
        </Button>
        <div>
          <h2>{title}</h2>
          <p>
            {isEditing
              ? "Измените нужные поля и сохраните."
              : "Заполните данные новой записи."}
          </p>
        </div>
      </div>

      <article className="mvp-card">{<AdminForm />}</article>
    </section>
  );
}
