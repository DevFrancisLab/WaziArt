interface AccessibleStatusMessageProps {
  message: string;
  politeness?: "polite" | "assertive";
}

/** A live region for loading, success, and failure announcements. */
export function AccessibleStatusMessage({
  message,
  politeness = "polite",
}: AccessibleStatusMessageProps) {
  if (politeness === "assertive") {
    return (
      <p className="live alert" role="alert">
        {message}
      </p>
    );
  }
  return (
    <p className="live" role="status">
      {message}
    </p>
  );
}
