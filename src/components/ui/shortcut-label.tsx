interface ShortcutLabelProps {
  /** Button text on wide screens, such as "Refresh". */
  label: string;
  /** Keyboard shortcut shown after the label on wide screens, such as "Ctrl+R". */
  shortcut?: string;
  /** Shorter button text for phones and tablets; defaults to `label`. */
  short?: string;
}

/**
 * A header button's text with its keyboard shortcut, e.g. "Refresh (Ctrl+R)".
 * The shortcut only shows from `xl` up, where a keyboard is likely and there is
 * room; on tablets and phones the button shows the short label on one line.
 */
export function ShortcutLabel({ label, shortcut, short }: ShortcutLabelProps) {
  return (
    <>
      <span className="hidden whitespace-nowrap xl:inline">{shortcut ? `${label} (${shortcut})` : label}</span>
      <span className="whitespace-nowrap xl:hidden">{short ?? label}</span>
    </>
  );
}
