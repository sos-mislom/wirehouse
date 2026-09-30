const headers = [
  "Код графика",
  "Объект",
  "Помещение",
  "Название",
  "Периодичность",
  "Интервал",
  "Следующая дата",
  "Чек-лист",
];
export function scheduleFile(
  f,
  {
    key = "PPR-001",
    unit = f.unit.id,
    property = f.property.id,
    day = "2030-01-31",
    extraRows = [],
  } = {},
) {
  const rows = [
    headers,
    [
      key,
      property,
      unit,
      "Проверка фильтра",
      "месяцы",
      "1",
      day,
      'Осмотреть|Проверить "фильтр"',
    ],
    ...extraRows,
  ];
  return {
    fileName: "schedule.csv",
    contentBase64: Buffer.from(
      rows
        .map((r) =>
          r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(";"),
        )
        .join("\r\n"),
    ).toString("base64"),
  };
}
