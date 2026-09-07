"use client";

import { CodeField } from "./fields/CodeField";
import { ModeTabs } from "./fields/ModeTabs";
import { useLocalStorageState } from "./useLocalStorageState";

type Mode = "encode" | "decode";

interface Base64State {
  readable: string;
  base64: string;
  mode: Mode;
}

const DEFAULT_STATE: Base64State = { readable: "", base64: "", mode: "encode" };

function readableToBase64(readable: string): string {
  const bytes = new TextEncoder().encode(readable);
  const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), "");
  return btoa(binary);
}

function base64ToReadable(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function Base64Tool() {
  const [state, setState] = useLocalStorageState<Base64State>("tools.base64", DEFAULT_STATE);
  const { readable, base64, mode } = state;

  const updateReadable = (readable: string) => {
    try {
      setState({ ...state, readable, base64: readableToBase64(readable) });
    } catch (err) {
      console.warn(err);
      setState({ ...state, readable });
    }
  };

  const updateBase64 = (base64: string) => {
    try {
      setState({ ...state, base64, readable: base64ToReadable(base64) });
    } catch (err) {
      console.warn(err);
      setState({ ...state, base64 });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="nb-display text-base">Base64 decoding &amp; encoding</h2>
      <ModeTabs
        value={mode}
        onChange={(mode) => setState({ ...state, mode })}
        options={[
          { key: "encode", label: "Encode" },
          { key: "decode", label: "Decode" },
        ]}
      />
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Text</label>
        <CodeField value={readable} onChange={updateReadable} disabled={mode !== "encode"} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Base64</label>
        <CodeField value={base64} onChange={updateBase64} disabled={mode !== "decode"} />
      </div>
    </div>
  );
}
