export type IconName = "home" | "activity" | "savings" | "skills" | "memory" | "settings" | "help";

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 10 4l7 6.5" />
      <path d="M5 9.5V17a1 1 0 0 0 1 1h3v-4.5h2V18h3a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  activity: <path d="M2.5 10.5h3l2-5.5 3 11 2-8 1.3 2.5h3.7" />,
  savings: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="14" cy="14" r="2" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </>
  ),
  skills: (
    <>
      <path d="M10 2.5c.5 2.6 1 4.2 2.5 5.5s2.9 2 5.5 2.5c-2.6.5-4.2 1-5.5 2.5s-2 2.9-2.5 5.5c-.5-2.6-1-4.2-2.5-5.5S4.1 11 1.5 10.5c2.6-.5 4.2-1 5.5-2.5s2-2.9 2.5-5.5z" />
    </>
  ),
  memory: (
    <>
      <circle cx="5" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="10" cy="15" r="1.6" />
      <line x1="6.4" y1="6.7" x2="9" y2="13.3" />
      <line x1="13.6" y1="6.7" x2="11" y2="13.3" />
      <line x1="6.6" y1="6" x2="13.4" y2="6" />
    </>
  ),
  settings: (
    <>
      <line x1="3" y1="6" x2="17" y2="6" />
      <circle cx="8" cy="6" r="1.7" fill="currentColor" stroke="none" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <circle cx="13" cy="10" r="1.7" fill="currentColor" stroke="none" />
      <line x1="3" y1="14" x2="17" y2="14" />
      <circle cx="6" cy="14" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  help: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7.7 7.9a2.3 2.3 0 1 1 3.4 2c-.75.45-1.15.85-1.15 1.85" />
      <line x1="10" y1="14.3" x2="10" y2="14.32" />
    </>
  ),
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
