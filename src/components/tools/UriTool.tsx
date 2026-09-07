"use client";

import { CodeField } from "./fields/CodeField";
import { ModeTabs } from "./fields/ModeTabs";
import { useLocalStorageState } from "./useLocalStorageState";

type Mode = "encode" | "decode";
type Encoding = "component" | "regular";

interface UriState {
  readable: string;
  uriEncoded: string;
  mode: Mode;
  encoding: Encoding;
}

const DEFAULT_STATE: UriState = {
  readable: "",
  uriEncoded: "",
  mode: "encode",
  encoding: "component",
};

function encode(readable: string, encoding: Encoding): string {
  return encoding === "component" ? encodeURIComponent(readable) : encodeURI(readable);
}

function decode(uriEncoded: string, encoding: Encoding): string {
  return encoding === "component" ? decodeURIComponent(uriEncoded) : decodeURI(uriEncoded);
}

export function UriTool() {
  const [state, setState] = useLocalStorageState<UriState>("tools.uri", DEFAULT_STATE);
  const { readable, uriEncoded, mode, encoding } = state;

  const updateReadable = (readable: string) => {
    try {
      setState({ ...state, readable, uriEncoded: encode(readable, encoding) });
    } catch (err) {
      console.warn(err);
      setState({ ...state, readable });
    }
  };

  const updateUriEncoded = (uriEncoded: string) => {
    if (mode !== "decode") {
      setState({ ...state, uriEncoded });
      return;
    }
    try {
      setState({ ...state, uriEncoded, readable: decode(uriEncoded, encoding) });
    } catch (err) {
      console.warn(err);
      setState({ ...state, uriEncoded });
    }
  };

  const updateEncoding = (encoding: Encoding) => {
    try {
      if (mode === "decode") {
        setState({ ...state, encoding, readable: decode(uriEncoded, encoding) });
      } else {
        setState({ ...state, encoding, uriEncoded: encode(readable, encoding) });
      }
    } catch (err) {
      console.warn(err);
      setState({ ...state, encoding });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="nb-display text-base">URI encoding &amp; decoding</h2>
      <div className="flex flex-wrap items-center gap-4">
        <ModeTabs
          value={encoding}
          onChange={updateEncoding}
          options={[
            { key: "component", label: "Component" },
            { key: "regular", label: "Regular" },
          ]}
        />
        <ModeTabs
          value={mode}
          onChange={(mode) => setState({ ...state, mode })}
          options={[
            { key: "encode", label: "Encode" },
            { key: "decode", label: "Decode" },
          ]}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Text</label>
        <CodeField value={readable} onChange={updateReadable} disabled={mode !== "encode"} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">URI encoded</label>
        <CodeField value={uriEncoded} onChange={updateUriEncoded} disabled={mode !== "decode"} />
      </div>
    </div>
  );
}
