"use client";

export function TicketSelection({ id, ticketKey, checked, disabled, onChange }: {
  id: string;
  ticketKey: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <>
      <label
        htmlFor={id}
        className={`absolute inset-0 z-10 select-none rounded-[inherit] ${disabled ? "cursor-default" : "cursor-pointer"}`}
        onClick={(event) => {
          // Firefox can suppress a label's default checkbox activation after
          // slight mouse movement. Forward the click explicitly, exactly once.
          event.preventDefault();
          const input = event.currentTarget.control;
          if (input instanceof HTMLInputElement && !input.disabled) {
            input.focus({ preventScroll: true });
            input.click();
          }
        }}
      >
        <span className="sr-only">Select {ticketKey}</span>
      </label>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="relative z-20 mr-2 size-4 align-middle accent-nb-orange"
      />
    </>
  );
}
