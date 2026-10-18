const snake = (value) =>
  value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
export function table(
  fields,
  { key = ["id"], required = [], references = {}, checks = [] } = {},
) {
  const columns = Object.entries(fields).flatMap(([type, names]) =>
    names
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => ({
        name,
        sql: snake(name),
        type,
        required: key.includes(name) || required.includes(name),
        reference: references[name],
      })),
  );
  return { columns, key, checks };
}
