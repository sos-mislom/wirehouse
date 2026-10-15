type Name = "dashboard" | "tickets" | "billing" | "chat" | "forward";
const paths: Record<Name, string> = {
  forward: "M9 5l7 7-7 7",
  dashboard: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  tickets: "M9 4h6m-6 0H5v17h14V4h-4M9 3h6v4H9ZM8 12h8M8 16h5",
  billing: "M4 5h16v15H4ZM4 9h16M14 14h3",
  chat: "M4 4h16v13H9l-5 4ZM8 9h8M8 13h5",
};
export function NavigationIcon({ name }: { name: Name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
