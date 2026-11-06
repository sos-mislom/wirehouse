import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  listDocumentTemplates,
  readDocumentTemplate,
} from "../apps/api/src/services/document-templates.js";

test("blank form catalog exposes useful context and both actual file formats", async () => {
  const items = listDocumentTemplates();
  assert.equal(items.length, 14);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  for (const item of items) {
    assert.equal(item.formType, "blank");
    assert.equal(item.legalStatus, "recommended");
    assert.ok(item.entityTypes.length);
    assert.ok(item.description.length > 15);
    assert.ok(item.legalBasis.every((source) => source.url.startsWith("https://")));
    assert.deepEqual(item.files.map((file) => file.format).sort(), ["docx", "pdf"]);
    for (const file of item.files) {
      assert.equal("asset" in file, false);
      assert.equal(/[\\/:*?"<>|]/.test(file.filename), false);
      const result = await readDocumentTemplate(item.id, file.format);
      assert.equal(result.content.length, file.sizeBytes);
      assert.equal(result.sha256, file.sha256);
      assert.equal(createHash("sha256").update(result.content).digest("hex"), file.sha256);
      if (file.format === "pdf") {
        assert.equal(result.mimeType, "application/pdf");
        assert.ok(result.content.subarray(0, 5).equals(Buffer.from("%PDF-")));
        assert.ok(result.content.subarray(-1024).includes(Buffer.from("%%EOF")));
        assert.ok(file.pages >= 1 && file.pages <= 2);
      } else {
        assert.ok(result.content.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])));
        assert.ok(result.content.includes(Buffer.from("word/document.xml")));
      }
    }
  }
});

test("template context filtering stays relevant and catalog callers cannot mutate later results", () => {
  const meters = listDocumentTemplates({ entityType: "meters" });
  assert.deepEqual(meters.map((item) => item.id).sort(), ["meter-commissioning", "meter-readings"]);
  assert.ok(listDocumentTemplates({ entityType: "leases", category: "contract" }).every((item) => item.category === "contract" && item.entityTypes.includes("leases")));
  const copy = listDocumentTemplates();
  copy[0].title = "changed";
  copy[0].files[0].filename = "changed";
  assert.notEqual(listDocumentTemplates()[0].title, "changed");
  assert.notEqual(listDocumentTemplates()[0].files[0].filename, "changed");
});

test("template file lookup rejects traversal, unknown forms and unsupported formats", async () => {
  for (const [id, format] of [["../catalog", "json"], ["lease-agreement", "html"], ["unknown", "pdf"], ["lease-agreement/../../package", "docx"]]) {
    await assert.rejects(readDocumentTemplate(id, format), (error) => error.status === 404);
  }
});
