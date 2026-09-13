/**
 * Visually hidden polite live region for results that render in place after
 * a wait. Keep it mounted and change `message`: screen readers often skip a
 * region that is inserted together with its text.
 */
export function LiveAnnouncer({ message }: { message: string }) {
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  );
}
