"use client";

import { CodeField } from "./fields/CodeField";
import { ToggleField } from "./fields/ToggleField";
import { useLocalStorageState } from "./useLocalStorageState";

interface WhitespaceState {
  input: string;
  spaces: boolean;
  tabs: boolean;
  newline: boolean;
}

const DEFAULT_STATE: WhitespaceState = {
  input: "",
  spaces: true,
  tabs: true,
  newline: true,
};

export function WhitespaceTool() {
  const [state, setState] = useLocalStorageState<WhitespaceState>("tools.whitespace", DEFAULT_STATE);
  const { input, spaces, tabs, newline } = state;

  let output = input;
  if (spaces) output = output.replace(/ /g, "");
  if (tabs) output = output.replace(/\t/g, "");
  if (newline) output = output.replace(/[\r\n\f\v]/g, "");

  return (
    <div className="flex flex-col gap-4">
      <h2 className="nb-display text-base">Whitespace removal</h2>
      <div className="flex flex-wrap gap-2">
        <ToggleField label="Spaces" value={spaces} onToggle={() => setState({ ...state, spaces: !spaces })} />
        <ToggleField label="Tabs" value={tabs} onToggle={() => setState({ ...state, tabs: !tabs })} />
        <ToggleField label="Newlines" value={newline} onToggle={() => setState({ ...state, newline: !newline })} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Text</label>
        <CodeField value={input} onChange={(input) => setState({ ...state, input })} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Output</label>
        <CodeField value={output} disabled />
      </div>
    </div>
  );
}
