"use client";

import jwt from "jwt-simple";
import { CodeField } from "./fields/CodeField";
import { TextField } from "./fields/TextField";
import { SelectField } from "./fields/SelectField";
import { ModeTabs } from "./fields/ModeTabs";
import { useLocalStorageState } from "./useLocalStorageState";

const ALGORITHMS = ["HS256", "HS384", "HS512", "RS256"] as const;
type Algorithm = (typeof ALGORITHMS)[number];
type Mode = "generate" | "inspect";

interface JwtState {
  payload: string;
  token: string;
  secret: string;
  valid: boolean;
  algorithm: Algorithm;
  mode: Mode;
}

const DEFAULT_STATE: JwtState = {
  payload: "",
  token: "",
  secret: "",
  valid: false,
  algorithm: "HS256",
  mode: "inspect",
};

export function JwtTool() {
  const [state, setState] = useLocalStorageState<JwtState>("tools.jwt", DEFAULT_STATE);
  const { mode, token, payload, secret, algorithm, valid } = state;

  const updatePayload = (payload: string) => {
    try {
      const token = jwt.encode(payload, secret, algorithm);
      setState({ ...state, payload, token, valid: true });
    } catch (err) {
      console.warn(err);
      setState({ ...state, payload });
    }
  };

  const updateToken = (token: string) => {
    try {
      const payload = jwt.decode(token, secret, false, algorithm);
      setState({ ...state, token, payload, valid: true });
    } catch (err) {
      console.warn(err);
      try {
        const payload = jwt.decode(token, secret, true, algorithm);
        setState({ ...state, token, payload, valid: false });
      } catch (err2) {
        console.warn(err2);
        setState({ ...state, token, payload: "", valid: false });
      }
    }
  };

  const updateSecret = (secret: string) => {
    if (mode === "generate") {
      try {
        const token = jwt.encode(payload, secret, algorithm);
        setState({ ...state, secret, token, valid: true });
      } catch (err) {
        console.warn(err);
        setState({ ...state, secret });
      }
      return;
    }

    try {
      const payload = jwt.decode(token, secret, true, algorithm);
      try {
        jwt.decode(token, secret, false, algorithm);
        setState({ ...state, secret, payload, valid: true });
      } catch (err) {
        console.warn(err);
        setState({ ...state, secret, payload, valid: false });
      }
    } catch (err) {
      console.warn(err);
      setState({ ...state, secret });
    }
  };

  const updateAlgorithm = (algorithm: Algorithm) => {
    try {
      const token = jwt.encode(payload, secret, algorithm);
      setState({ ...state, algorithm, token, valid: true });
    } catch (err) {
      console.warn(err);
      setState({ ...state, algorithm });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="nb-display text-base">JWT inspection &amp; generation</h2>
      <ModeTabs
        value={mode}
        onChange={(mode) => setState({ ...state, mode })}
        options={[
          { key: "generate", label: "Generate token" },
          { key: "inspect", label: "Inspect token" },
        ]}
      />
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Token</label>
        <CodeField
          value={token}
          onChange={updateToken}
          disabled={mode !== "inspect"}
          status={mode === "inspect" ? (valid ? "valid" : "invalid") : undefined}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Payload</label>
        <CodeField value={payload} onChange={updatePayload} disabled={mode !== "generate"} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="w-24 text-sm font-semibold text-nb-ink">Secret</label>
        <TextField value={secret} onChange={updateSecret} className="flex-1" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="w-24 text-sm font-semibold text-nb-ink">Algorithm</label>
        <SelectField value={algorithm} options={ALGORITHMS} onChange={updateAlgorithm} />
      </div>
    </div>
  );
}
