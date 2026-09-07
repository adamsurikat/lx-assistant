"use client";

import { prettyPrint } from "@base2/pretty-print-object";
import { CodeField } from "./fields/CodeField";
import { ModeTabs } from "./fields/ModeTabs";
import { useLocalStorageState } from "./useLocalStorageState";

type Mode = "parse" | "stringify";

interface JsonState {
  json: string;
  jsObject: string;
  mode: Mode;
  valid: boolean;
}

const DEFAULT_STATE: JsonState = { json: "", jsObject: "", mode: "parse", valid: true };

// Uses Function (rather than JSON.parse) so object-literal shorthand,
// unquoted keys, trailing commas, etc. — valid JS but not valid JSON — are
// accepted when converting a pasted JS object literal back to JSON.
function jsObjectToJson(jsObject: string): string {
  const value = new Function(`return (${jsObject});`)();
  return JSON.stringify(value);
}

function jsonToJsObject(json: string): string {
  return prettyPrint(JSON.parse(json));
}

export function JsonTool() {
  const [state, setState] = useLocalStorageState<JsonState>("tools.json", DEFAULT_STATE);
  const { json, jsObject, mode, valid } = state;

  const updateJson = (json: string) => {
    try {
      setState({ ...state, json, jsObject: jsonToJsObject(json), valid: true });
    } catch (err) {
      console.warn(err);
      setState({ ...state, json, jsObject: "", valid: false });
    }
  };

  const updateJsObject = (jsObject: string) => {
    try {
      setState({ ...state, jsObject, json: jsObjectToJson(jsObject), valid: true });
    } catch (err) {
      console.warn(err);
      setState({ ...state, jsObject, json: "", valid: false });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="nb-display text-base">JSON / JavaScript object conversion</h2>
      <ModeTabs
        value={mode}
        onChange={(mode) => setState({ ...state, mode })}
        options={[
          { key: "parse", label: "Parse" },
          { key: "stringify", label: "Stringify" },
        ]}
      />
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">JSON</label>
        <CodeField
          value={json}
          onChange={updateJson}
          disabled={mode !== "parse"}
          status={mode === "parse" ? (valid ? "valid" : "invalid") : undefined}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">JavaScript object</label>
        <CodeField
          value={jsObject}
          onChange={updateJsObject}
          disabled={mode !== "stringify"}
          status={mode === "stringify" ? (valid ? "valid" : "invalid") : undefined}
        />
      </div>
    </div>
  );
}
