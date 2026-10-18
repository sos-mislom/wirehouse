// The product searches Russian and English consistently, including databases
// initialized with the C locale (whose lower()/ILIKE do not fold Cyrillic).
export const literalSearch = (value) =>
  value.toLocaleLowerCase("ru").replace(/[\\%_]/g, "\\$&");
export const searchable = (expression) =>
  `lower(translate(${expression},'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ','абвгдеёжзийклмнопрстуфхцчшщъыьэюя'))`;
